import * as fs from 'fs';
import * as os from 'os';
import yaml from 'js-yaml';
import * as path from 'path';

import { LogManager } from '../../log/logManager';
import { Utils } from '../../treeDataProviders/utils/utils';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { AnalyzerRequest, AnalyzerScanResponse, AnalyzeScanRequest } from './analyzerModels';
import { ConnectionManager } from '../../connect/connectionManager';
import { ConnectionUtils } from '../../connect/connectionUtils';
import { IProxyConfig } from 'jfrog-client-js';
import { Configuration } from '../../utils/configuration';

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
    private _isSupported: boolean = true;

    protected static readonly RUNNER_FOLDER: string = 'analyzer-manager';
    private static readonly RUNNER_NAME: string = 'analyzerManager';

    private static readonly NOT_ENTITLED: number = 31;

    constructor(
        protected _connectionManager: ConnectionManager,
        protected _abortCheckInterval: number,
        protected _logManager: LogManager,
        protected _binaryPath: string = path.join(ScanUtils.getHomePath(), BinaryRunner.RUNNER_FOLDER, BinaryRunner.getBinaryName())
    ) {
        this._runDirectory = path.dirname(_binaryPath);
        this._isSupported = this.validateSupported();

        if (this._abortCheckInterval <= 0) {
            // Default check in 1 sec intervals
            this._abortCheckInterval = 1 * 1000;
        }
    }

    /**
     * Get the binary name for the runner base on the running os
     * @returns the name of the expected binary file to run
     */
    protected static getBinaryName(): string {
        let name: string = BinaryRunner.RUNNER_NAME;
        switch (os.platform()) {
            case 'win32':
                return name + '_windows.exe';
            case 'linux':
                return name + '_linux';
            case 'darwin':
                name += '_mac';
                if (os.arch() === 'arm' || os.arch() === 'arm64') {
                    return name + '_arm';
                } else {
                    return name + '_amd';
                }
        }
        return name;
    }

    /**
     * Run the executeBinary method with the provided request path
     * @param abortSignal - signal to abort the operation
     * @param yamlConfigPath - the path to the request
     */
    public abstract runBinary(abortSignal: AbortSignal, yamlConfigPath: string): Promise<void>;

    /**
     * Validates that the binary exists and can run
     * @returns true if supported false otherwise
     */
    protected validateSupported(): boolean {
        return fs.existsSync(this._binaryPath);
    }

    /**
     * Execute the cmd command to run the binary with given arguments and an option to abort the operation.
     * Checks every this._abortCheckInterval to see if the abort signal was given
     * @param abortSignal - the signal to abort the operation
     * @param args - the arguments for the command
     */
    protected async executeBinary(abortSignal: AbortSignal, args: string[]): Promise<void> {
        let tasksInfo: { activeTasks: number; signal: AbortSignal; tasks: Promise<any>[] } = { activeTasks: 1, signal: abortSignal, tasks: [] };
        // Add execute cmd task
        tasksInfo.tasks.push(
            ScanUtils.executeCmdAsync('"' + this._binaryPath + '" ' + args.join(' '), this._runDirectory, this.createEnvForRun())
                .then(std => {
                    if (std.stdout && std.stdout.length > 0) {
                        this._logManager.logMessage("Done executing '" + Utils.getLastSegment(this._binaryPath) + "', log:\n" + std.stdout, 'DEBUG');
                    }
                    if (std.stderr && std.stderr.length > 0) {
                        this._logManager.logMessage(
                            "Done executing '" + Utils.getLastSegment(this._binaryPath) + "' with error, error log:\n" + std.stderr,
                            'ERR'
                        );
                    }
                })
                .finally(() => tasksInfo.activeTasks--)
        );
        // Add check abort task
        tasksInfo.tasks.push(this.checkIfAbortedTask(tasksInfo));
        await Promise.all(tasksInfo.tasks);
    }

    /**
     * Create the needed environment variables for the runner to run
     * @returns list of environment variables to use while executing the runner or unidentified if credential not set
     */
    private createEnvForRun(): NodeJS.ProcessEnv | undefined {
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
     */
    private prepareRequests(args: RunArgs, ...requests: AnalyzeScanRequest[]) {
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
    }

    /**
     * Async task that checks if an abort signal was given every this._abortCheckInterval milliseconds.
     * If the active task is <= 0 the task is completed
     * @param taskInfo - an object that holds the information about the active async tasks count and the abort signal for them
     */
    private async checkIfAbortedTask(taskInfo: { activeTasks: number; signal: AbortSignal }): Promise<void> {
        while (taskInfo.activeTasks > 0) {
            if (taskInfo.signal.aborted) {
                throw new ScanCancellationError();
            }
            await this.delay(this._abortCheckInterval);
        }
    }

    /**
     * Sleep and delay task for sleepIntervalMilliseconds
     * @param sleepIntervalMilliseconds - the amount of time in milliseconds to wait
     */
    private async delay(sleepIntervalMilliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sleepIntervalMilliseconds));
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
        if (!this._isSupported) {
            return undefined;
        }
        let args: RunArgs = {
            directory: ScanUtils.createTmpDir(),
            split: split,
            activeTasks: 0,
            requests: [],
            signal: abortController.signal
        } as RunArgs;
        this.prepareRequests(args, ...requests);
        if (args.requests.length == 0) {
            ScanUtils.removeFolder(args.directory);
            return undefined;
        }

        // Run
        let runs: Promise<any>[] = [];
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
        await Promise.all(runs).finally(() => ScanUtils.removeFolder(args.directory));
        return aggResponse;
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
        await this.runBinary(abortSignal, requestPath).catch(error => {
            if (error.code) {
                // Not entitled to run binary
                if (error.code === BinaryRunner.NOT_ENTITLED) {
                    throw new NotEntitledError();
                }
                this._logManager.logMessage(
                    "Binary '" + Utils.getLastSegment(this._binaryPath) + "' task ended with status code: " + error.code,
                    'ERR'
                );
                // TODO: remove when iac returns error code 0
                return;
            }
            throw error;
        });
        // 3. Collect responses
        let analyzerScanResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (const responsePath of responsePaths) {
            if (!fs.existsSync(responsePath)) {
                throw new Error("Running '" + Utils.getLastSegment(this._binaryPath) + "' binary didn't produce response.\nRequest: " + request);
            }
            // Load result and parse as response
            let result: AnalyzerScanResponse = JSON.parse(fs.readFileSync(responsePath, 'utf8').toString());
            if (result && result.runs) {
                analyzerScanResponse.runs.push(...result.runs);
            }
        }
        return analyzerScanResponse;
    }

    /**
     * Check if the runner is supported and can produce responses
     */
    public get isSupported(): boolean {
        return this._isSupported;
    }
}
