import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';

import { LogManager } from '../../log/logManager';
import { Utils } from '../../utils/utils';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { AnalyzerRequest, AnalyzerScanResponse, AnalyzerType, AnalyzeScanRequest } from './analyzerModels';
import { ConnectionManager } from '../../connect/connectionManager';
import { ConnectionUtils } from '../../connect/connectionUtils';
import { IProxyConfig } from 'jfrog-client-js';
import { Configuration } from '../../utils/configuration';
import { Resource } from '../../utils/resource';
import { RunUtils } from '../../utils/runUtils';
import { Translators } from '../../utils/translators';
import { LogUtils } from '../../log/logUtils';

/**
 * Arguments for running binary async
 */
interface RunArgs {
    // Should split the requests to multiple runs
    split: boolean;
    // The directory that the requests/responses are expected
    directory: string;
    // The requests for the run
    requests: RunRequest[];
    // The signal to abort the operation
    signal: AbortSignal;
}

interface RunRequest {
    request: string;
    requestPath: string;
    responsePaths: string[];
}

export class NotEntitledError extends Error {
    message: string = 'User is not entitled to run the binary';
}

/**
 * Describes a runner for binary executable files.
 * The executable expected to be provided with a path to request file (yaml format) and produce a response file with a result
 */
export abstract class BinaryRunner {
    protected _runDirectory: string;

    private static readonly RUNNER_NAME: string = 'analyzerManager';

    private static readonly NOT_ENTITLED: number = 31;

    private static readonly DOWNLOAD_URL: string = '/xsc-gen-exe-analyzer-manager-local/v1/[RELEASE]/';

    constructor(
        protected _connectionManager: ConnectionManager,
        protected _abortCheckInterval: number,
        protected _logManager: LogManager,
        protected _binary: Resource = BinaryRunner.getAnalyzerManagerResource(_logManager)
    ) {
        this._runDirectory = path.dirname(this._binary.fullPath);

        if (this._abortCheckInterval <= 0) {
            // Default check in 1 sec intervals
            this._abortCheckInterval = 1 * 1000;
        }
    }

    public static getAnalyzerManagerResource(logManager: LogManager): Resource {
        return new Resource(
            Utils.addZipSuffix(BinaryRunner.DOWNLOAD_URL + Utils.getArchitecture() + '/' + BinaryRunner.RUNNER_NAME),
            Utils.addWinSuffixIfNeeded(path.join(ScanUtils.getIssuesPath(), BinaryRunner.RUNNER_NAME, BinaryRunner.RUNNER_NAME)),
            logManager
        );
    }

    /**
     * Run the executeBinary method with the provided request path
     * @param abortSignal - signal to abort the operation
     * @param yamlConfigPath - the path to the request
     * @param executionLogDirectory - og file will be written to the dir
     */
    public abstract runBinary(abortSignal: AbortSignal, yamlConfigPath: string, executionLogDirectory: string): Promise<void>;

    /**
     * Validates that the binary exists and can run
     * @returns true if supported false otherwise
     */
    public validateSupported(): boolean {
        return this._binary.isExists();
    }

    /**
     * Execute the cmd command to run the binary with given arguments and an option to abort the operation.
     * Checks every this._abortCheckInterval to see if the abort signal was given
     * @param abortSignal - the signal to abort the operation
     * @param args - the arguments for the command
     */
    protected async executeBinary(abortSignal: AbortSignal, args: string[], executionLogDirectory: string): Promise<void> {
        await RunUtils.withAbortSignal(
            abortSignal,
            this._abortCheckInterval,
            ScanUtils.executeCmdAsync(
                '"' + this._binary.fullPath + '" ' + args.join(' '),
                this._runDirectory,
                this.createEnvForRun(executionLogDirectory)
            ).then(std => {
                if (std.stdout && std.stdout.length > 0) {
                    this._logManager.logMessage("Done executing '" + this._binary.name + "' with log, log:\n" + std.stdout, 'DEBUG');
                }
                if (std.stderr && std.stderr.length > 0) {
                    this._logManager.logMessage("Done executing '" + this._binary.name + "' with error, error log:\n" + std.stderr, 'ERR');
                }
            })
        );
    }

    /**
     * Create the needed environment variables for the runner to run
     * @param executionLogDirectory - the directory that the log will be written into, if not provided the log will be written in stdout/stderr
     * @returns list of environment variables to use while executing the runner or unidentified if credential not set
     */
    private createEnvForRun(executionLogDirectory?: string): NodeJS.ProcessEnv | undefined {
        if (this._connectionManager.areXrayCredentialsSet()) {
            // Platform information
            let binaryVars: NodeJS.ProcessEnv = {
                JF_PLATFORM_URL: this._connectionManager.url
            };
            if (this._connectionManager.accessToken) {
                binaryVars.JF_TOKEN = this._connectionManager.accessToken;
            } else {
                binaryVars.JF_USER = this._connectionManager.username;
                binaryVars.JF_PASS = this._connectionManager.password;
            }
            // Log information
            binaryVars.JFROG_CLI_LOG_LEVEL = Translators.toAnalyzerLogLevel(Configuration.getLogLevel());
            if (executionLogDirectory) {
                binaryVars.AM_LOG_DIRECTORY = executionLogDirectory;
            }
            // Proxy information - environment variable
            let proxyHttpUrl: string | undefined = process.env['HTTP_PROXY'];
            let proxyHttpsUrl: string | undefined = process.env['HTTPS_PROXY'];
            // Proxy information - vscode configuration override
            let optional: IProxyConfig | boolean = ConnectionUtils.getProxyConfig();
            if (optional) {
                let proxyConfig: IProxyConfig = <IProxyConfig>optional;
                let proxyUrl: string = proxyConfig.host + (proxyConfig.port !== 0 ? ':' + proxyConfig.port : '');
                proxyHttpUrl = proxyUrl;
                proxyHttpsUrl = proxyUrl;
            }
            // Proxy url
            if (proxyHttpUrl) {
                binaryVars.HTTP_PROXY = 'http://' + this.addOptionalProxyAuthInformation(proxyHttpUrl);
            }
            if (proxyHttpsUrl) {
                binaryVars.HTTPS_PROXY = 'https://' + this.addOptionalProxyAuthInformation(proxyHttpsUrl);
            }

            return {
                ...process.env,
                ...binaryVars
            };
        }
        return undefined;
    }

    /**
     * Add optional proxy auth information to the base url if exists
     * @param url - the base url to add information on
     * @returns the url with the auth information if exists or the given url if not
     */
    private addOptionalProxyAuthInformation(url: string): string {
        let authOptional: string | undefined = Configuration.getProxyAuth();
        if (authOptional) {
            if (authOptional.startsWith('Basic ')) {
                // We expect the decoded auth string to be in the format: <proxy-user>:<proxy-password>
                return Buffer.from(authOptional.substring('Basic '.length), 'base64').toString('binary') + '@' + url;
            } else if (authOptional.startsWith('Bearer ')) {
                // Access token
                return url + '?access_token=' + authOptional.substring('Bearer '.length);
            }
        }
        return url;
    }

    /**
     * Translate the run requests to a single analyze request in yaml format
     * @param requests - run requests
     * @returns analyze request in YAML format
     */
    public asAnalyzerRequestString(...requests: AnalyzeScanRequest[]): string {
        return yaml.dump({
            scans: requests
        } as AnalyzerRequest);
    }

    /**
     * Populate the args requests arguments based on the given requests information
     * @param args - the run requests to populate
     * @param requests - the run requests information
     * @return the first valid request from the given request
     */
    private prepareRequests(args: RunArgs, ...requests: AnalyzeScanRequest[]): AnalyzeScanRequest | undefined {
        let actualRequest: { requests: AnalyzeScanRequest[]; responsePaths: string[] } = { requests: [], responsePaths: [] };
        for (const request of requests) {
            if (request.roots.length > 0) {
                // Prepare request information and insert as an actual request
                const requestPath: string = path.join(args.directory, 'request_' + args.requests.length);
                const responsePath: string = path.join(args.directory, 'response_' + args.requests.length);
                request.output = responsePath;
                if (args.split) {
                    // Insert as actual request to args request
                    args.requests.push({
                        request: this.asAnalyzerRequestString(request),
                        requestPath: requestPath,
                        responsePaths: [responsePath]
                    } as RunRequest);
                } else {
                    // Insert to actual requests
                    actualRequest.requests.push(request);
                    actualRequest.responsePaths.push(responsePath);
                }
            }
        }
        // In case the split parameter is false insert the actual requests as a single request to the args
        if (!args.split && actualRequest.requests.length > 0) {
            args.requests.push({
                request: this.asAnalyzerRequestString(...actualRequest.requests),
                requestPath: path.join(args.directory, 'request'),
                responsePaths: actualRequest.responsePaths
            } as RunRequest);
        }
        return actualRequest.requests.length > 0 ? actualRequest.requests[0] : undefined;
    }

    /**
     * Run the runner async, and perform the given run requests using this binary.
     * @param abortController - the abort controller that signals on a cancel/abort request
     * @param split - if true the runner will be run separately for all the requests otherwise all the requests will be performed together
     * @param requests - the request to perform using this binary
     * @returns - the binary analyzer scan response after running for all the request
     */
    public async run(abortController: AbortController, split: boolean, ...requests: AnalyzeScanRequest[]): Promise<AnalyzerScanResponse | undefined> {
        // Prepare and validate
        if (!this.validateSupported()) {
            return undefined;
        }
        let args: RunArgs = {
            directory: ScanUtils.createTmpDir(),
            split: split,
            activeTasks: 0,
            requests: [],
            signal: abortController.signal
        } as RunArgs;
        let validRequest: AnalyzeScanRequest | undefined = this.prepareRequests(args, ...requests);
        if (args.requests.length == 0 || !validRequest) {
            ScanUtils.removeFolder(args.directory);
            return undefined;
        }
        // Run
        let runs: Promise<any>[] = [];
        let aggResponse: AnalyzerScanResponse = this.populateRunTasks(args, runs);
        let hadError: boolean = false;
        await Promise.all(runs)
            .catch(err => {
                hadError = true;
                throw err;
            })
            .finally(() => {
                if (!validRequest) {
                    return;
                }
                // Collect log if exist
                let requestType: AnalyzerType = validRequest.type;
                let requestRootName: string = Utils.getLastSegment(validRequest.roots[0]);
                this.copyRunLogToFolder(args.directory, requestType, requestRootName, hadError);
                ScanUtils.removeFolder(args.directory);
            });
        return aggResponse;
    }

    private populateRunTasks(args: RunArgs, runs: Promise<any>[]): AnalyzerScanResponse {
        let aggResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (let i: number = 0; i < args.requests.length; i++) {
            runs.push(
                this.runRequest(args.signal, args.requests[i].request, args.requests[i].requestPath, ...args.requests[i].responsePaths)
                    .then(response => {
                        if (response && response.runs) {
                            aggResponse.runs.push(...response.runs);
                        }
                    })
                    .catch(err => {
                        if (err instanceof ScanCancellationError || err instanceof NotEntitledError) {
                            throw err;
                        }
                        this._logManager.logError(err);
                    })
            );
        }
        return aggResponse;
    }

    /**
     * Copy a file that includes 'log' in its name from a given folder to the logs folder
     * @param logsSrcFolder - the directory that the log file exists in
     * @param requestType - the type of runner request of the log, will be part of it's name
     * @param rootName - the type of runner request of the log, will be part of it's name
     * @param hadError - if true, will log result as error, otherwise success.
     */
    private copyRunLogToFolder(logsSrcFolder: string, requestType: AnalyzerType, rootName: string, hadError: boolean) {
        let logFile: string | undefined = fs.readdirSync(logsSrcFolder).find(fileName => fileName.toLowerCase().includes('log'));
        if (!logFile) {
            return;
        }
        LogUtils.cleanUpOldLogs();
        let logFinalPath: string = path.join(ScanUtils.getLogsPath(), LogUtils.getLogFileName(rootName, requestType, '' + Date.now()));
        fs.copyFileSync(path.join(logsSrcFolder, logFile), logFinalPath);
        this._logManager.logMessage(
            'AnalyzerManager run ' +
                requestType +
                ' on ' +
                rootName +
                ' ended ' +
                (hadError ? 'with error' : 'successfully') +
                ', scan log was generated at ' +
                logFinalPath,
            hadError ? 'ERR' : 'DEBUG'
        );
    }

    /**
     * Perform the binary run, with an option to abort on signal in 3 steps :
     * 1. Save the request in a given path
     * 2. Run the binary
     * 3. Collect the responses for each run in the request
     * @param abortSignal - signal to abort the operation
     * @param request - the request to perform in YAML format
     * @param requestPath - the path that the request will be
     * @param responsePaths - the path of the response for each request in the run
     * @returns the response from all the binary runs
     */
    private async runRequest(
        abortSignal: AbortSignal,
        request: string,
        requestPath: string,
        ...responsePaths: string[]
    ): Promise<AnalyzerScanResponse> {
        // 1. Save requests as yaml file in folder
        fs.writeFileSync(requestPath, request);
        // 2. Run the binary
        await this.runBinary(abortSignal, requestPath, path.dirname(requestPath)).catch(error => {
            if (error.code) {
                // Not entitled to run binary
                if (error.code === BinaryRunner.NOT_ENTITLED) {
                    throw new NotEntitledError();
                }
                this._logManager.logMessage("Binary '" + this._binary.name + "' task ended with status code: " + error.code, 'ERR');
            }
            throw error;
        });
        // 3. Collect responses
        let analyzerScanResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (const responsePath of responsePaths) {
            if (!fs.existsSync(responsePath)) {
                throw new Error("Running '" + this._binary.name + "' binary didn't produce response.\nRequest: " + request);
            }
            // Load result and parse as response
            let result: AnalyzerScanResponse = JSON.parse(fs.readFileSync(responsePath, 'utf8').toString());
            if (result && result.runs) {
                analyzerScanResponse.runs.push(...result.runs);
            }
        }
        return analyzerScanResponse;
    }

    public get binary(): Resource {
        return this._binary;
    }
}
