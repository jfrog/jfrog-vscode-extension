import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';

import { LogManager } from '../../log/logManager';
import { Utils } from '../../utils/utils';
import { NotEntitledError, NotSupportedError, OsNotSupportedError, ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { AnalyzerRequest, AnalyzerScanResponse, ScanType, AnalyzeScanRequest } from './analyzerModels';
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
class RunArgs {
    // The requests for the run
    public requests: RunRequest[] = [];
    // The directory that the requests/responses are expected
    constructor(public readonly directory: string) {}

    public getRoots(): string[] {
        let roots: Set<string> = new Set<string>();
        this.requests.forEach(request => request.roots.forEach(root => roots.add(root)));
        return Array.from(roots);
    }
}

interface RunRequest {
    request: string;
    requestPath: string;
    roots: string[];
    responsePaths: string[];
}

/**
 * Describes a runner for binary executable files.
 * The executable expected to be provided with a path to request file (yaml format) and produce a response file with a result
 */
export abstract class BinaryRunner {
    protected _runDirectory: string;
    protected _verbose: boolean = false;

    private static readonly RUNNER_NAME: string = 'analyzerManager';
    private static readonly RUNNER_VERSION: string = '1.2.4.1921744';
    private static readonly DOWNLOAD_URL: string = '/xsc-gen-exe-analyzer-manager-local/v1/';

    public static readonly NOT_ENTITLED: number = 31;
    public static readonly NOT_SUPPORTED: number = 13;
    public static readonly OS_NOT_SUPPORTED: number = 55;

    public static readonly ENV_PLATFORM_URL: string = 'JF_PLATFORM_URL';
    public static readonly ENV_TOKEN: string = 'JF_TOKEN';
    public static readonly ENV_USER: string = 'JF_USER';
    public static readonly ENV_PASSWORD: string = 'JF_PASS';
    public static readonly ENV_LOG_DIR: string = 'AM_LOG_DIRECTORY';
    public static readonly ENV_HTTP_PROXY: string = 'HTTP_PROXY';
    public static readonly ENV_HTTPS_PROXY: string = 'HTTPS_PROXY';

    constructor(
        protected _connectionManager: ConnectionManager,
        protected _abortCheckInterval: number,
        protected _type: ScanType,
        protected _logManager: LogManager,
        protected _binary: Resource = BinaryRunner.getAnalyzerManagerResource(_logManager)
    ) {
        this._runDirectory = path.dirname(this._binary.fullPath);

        if (this._abortCheckInterval <= 0) {
            // Default check in 1 sec intervals
            this._abortCheckInterval = 1 * 1000;
        }
    }

    public static getDefaultAnalyzerManagerSourceUrl(version: string = '[RELEASE]'): string {
        return Utils.addZipSuffix(BinaryRunner.DOWNLOAD_URL + '/' + version + '/' + Utils.getArchitecture() + '/' + BinaryRunner.RUNNER_NAME);
    }

    public static getDefaultAnalyzerManagerTargetPath(baseDirectory?: string): string {
        return Utils.addWinSuffixIfNeeded(path.join(baseDirectory ?? ScanUtils.getIssuesPath(), BinaryRunner.RUNNER_NAME, BinaryRunner.RUNNER_NAME));
    }

    public static getAnalyzerManagerResource(logManager: LogManager, targetPath?: string): Resource {
        return new Resource(
            this.getDefaultAnalyzerManagerSourceUrl(BinaryRunner.RUNNER_VERSION),
            targetPath ?? this.getDefaultAnalyzerManagerTargetPath(),
            logManager
        );
    }

    public get verbose(): boolean {
        return this._verbose;
    }

    public set verbose(value: boolean) {
        this._verbose = value;
    }

    /**
     * Run the executeBinary method with the provided request path
     * @param checkCancel - check if cancel
     * @param yamlConfigPath - the path to the request
     * @param executionLogDirectory - og file will be written to the dir
     */
    protected abstract runBinary(yamlConfigPath: string, executionLogDirectory: string | undefined, checkCancel: () => void): Promise<void>;

    /**
     * Validates that the binary exists and can run
     * @returns true if supported false otherwise
     */
    public validateSupported(): boolean {
        return this._binary.isExists();
    }

    /**
     * Execute the cmd command to run the binary with given arguments and an option to abort the operation.
     * @param checkCancel - check if should cancel
     * @param args  - the arguments for the command
     * @param executionLogDirectory - the directory to save the execution log in
     */
    protected async executeBinary(checkCancel: () => void, args: string[], executionLogDirectory?: string): Promise<void> {
        await RunUtils.runWithTimeout(this._abortCheckInterval, checkCancel, {
            title: this._binary.name,
            task: this.executeBinaryTask(args, executionLogDirectory)
        });
    }

    /**
     * Execute the cmd command to run the binary with given arguments
     * @param args  - the arguments for the command
     * @param executionLogDirectory - the directory to save the execution log in
     */
    private async executeBinaryTask(args: string[], executionLogDirectory?: string): Promise<any> {
        let std: any = await ScanUtils.executeCmdAsync(
            '"' + this._binary.fullPath + '" ' + args.join(' '),
            this._runDirectory,
            this.createEnvForRun(executionLogDirectory)
        );
        if (std.stdout && std.stdout.length > 0) {
            this.logTaskResult(std.stdout, false);
        }
        if (std.stderr && std.stderr.length > 0) {
            this.logTaskResult(std.stderr, true);
        }
    }

    private logTaskResult(stdChannel: string, isErr: boolean) {
        let text: string = "Done executing '" + Translators.toAnalyzerTypeString(this._type) + "' with log, log:\n" + stdChannel;
        if (this._verbose) {
            console.log(text);
        }
        this._logManager.logMessage(text, isErr ? 'ERR' : 'DEBUG');
    }

    /**
     * Create the needed environment variables for the runner to run
     * @param executionLogDirectory - the directory that the log will be written into, if not provided the log will be written in stdout/stderr
     * @returns list of environment variables to use while executing the runner or unidentified if credential not set
     */
    public createEnvForRun(executionLogDirectory?: string): NodeJS.ProcessEnv | undefined {
        if (!this._connectionManager.areXrayCredentialsSet()) {
            return undefined;
        }

        let binaryVars: NodeJS.ProcessEnv = { JFROG_CLI_LOG_LEVEL: Translators.toAnalyzerLogLevel(Configuration.getLogLevel()) };
        // Platform information
        binaryVars[BinaryRunner.ENV_PLATFORM_URL] = this._connectionManager.url;
        // Credentials information
        if (this._connectionManager.accessToken) {
            binaryVars[BinaryRunner.ENV_TOKEN] = this._connectionManager.accessToken;
        } else {
            binaryVars[BinaryRunner.ENV_USER] = this._connectionManager.username;
            binaryVars[BinaryRunner.ENV_PASSWORD] = this._connectionManager.password;
        }

        this.populateOptionalInformation(binaryVars, executionLogDirectory);

        return {
            ...process.env,
            ...binaryVars
        };
    }

    private populateOptionalInformation(binaryVars: NodeJS.ProcessEnv, executionLogDirectory?: string) {
        // Optional proxy information - environment variable
        let proxyHttpUrl: string | undefined = process.env['HTTP_PROXY'];
        let proxyHttpsUrl: string | undefined = process.env['HTTPS_PROXY'];
        // Optional proxy information - vscode configuration override
        let optional: IProxyConfig | boolean = ConnectionUtils.getProxyConfig();
        if (optional) {
            let proxyConfig: IProxyConfig = <IProxyConfig>optional;
            let proxyUrl: string = proxyConfig.host + (proxyConfig.port !== 0 ? ':' + proxyConfig.port : '');
            proxyHttpUrl = 'http://' + proxyUrl;
            proxyHttpsUrl = 'https://' + proxyUrl;
        }
        if (proxyHttpUrl) {
            binaryVars[BinaryRunner.ENV_HTTP_PROXY] = this.addOptionalProxyAuthInformation(proxyHttpUrl);
        }
        if (proxyHttpsUrl) {
            binaryVars[BinaryRunner.ENV_HTTPS_PROXY] = this.addOptionalProxyAuthInformation(proxyHttpsUrl);
        }
        // Optional log destination
        if (executionLogDirectory) {
            binaryVars.AM_LOG_DIRECTORY = executionLogDirectory;
        }
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

    public async run(checkCancel: () => void, ...requests: AnalyzeScanRequest[]): Promise<AnalyzerScanResponse | undefined> {
        if (!this.validateSupported()) {
            return undefined;
        }
        let args: RunArgs = this.createRunArguments(...requests);
        try {
            if (args.requests.length == 0) {
                return undefined;
            }
            return await this.runTasks(args, checkCancel);
        } finally {
            ScanUtils.removeFolder(args.directory);
        }
    }

    /**
     * Populate the run arguments based on the given requests information
     * @param requests - the run requests information
     * @return run arguments for the given requests
     */
    private createRunArguments(...requests: AnalyzeScanRequest[]): RunArgs {
        let args: RunArgs = new RunArgs(ScanUtils.createTmpDir());
        let processedRoots: Set<string> = new Set<string>();

        for (const request of requests) {
            if (request.roots.length > 0 && request.roots.every(root => !processedRoots.has(root))) {
                // Prepare request information and insert as an actual request
                const requestPath: string = path.join(args.directory, 'request_' + args.requests.length);
                const responsePath: string = path.join(args.directory, 'response_' + args.requests.length);
                request.output = responsePath;
                request.type = this._type;
                request.roots.forEach(root => processedRoots.add(root));
                // Add request to run
                args.requests.push({
                    request: this.requestsToYaml(request),
                    requestPath: requestPath,
                    roots: request.roots,
                    responsePaths: [responsePath]
                } as RunRequest);
            }
        }

        return args;
    }

    /**
     * Translate the run requests to a single analyze request in yaml format
     * @param requests - run requests
     * @returns analyze request in YAML format
     */
    public requestsToYaml(...requests: AnalyzeScanRequest[]): string {
        return yaml
            .dump({
                scans: requests
            } as AnalyzerRequest)
            .replace('skipped_folders', 'skipped-folders');
    }

    private async runTasks(args: RunArgs, checkCancel: () => void): Promise<AnalyzerScanResponse> {
        let runs: Promise<any>[] = [];
        let aggResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (let i: number = 0; i < args.requests.length; i++) {
            runs.push(
                this.runRequest(checkCancel, args.requests[i].request, args.requests[i].requestPath, ...args.requests[i].responsePaths)
                    .then(response => {
                        if (response && response.runs) {
                            aggResponse.runs.push(...response.runs);
                        }
                    })
                    .catch(err => {
                        if (err instanceof ScanCancellationError || err instanceof NotEntitledError || err instanceof NotSupportedError) {
                            throw err;
                        }
                        this._logManager.logError(err);
                    })
            );
        }
        let exeErr: Error | undefined;
        await Promise.all(runs)
            .catch(err => {
                exeErr = err;
                throw err;
            })
            // Collect log if exist
            .finally(() => this.handleExecutionLog(args, exeErr));
        return aggResponse;
    }

    private handleExecutionLog(args: RunArgs, exeErr: Error | undefined) {
        let hadError: boolean = exeErr !== undefined;
        let logPath: string | undefined = this.copyRunLogToFolder(args, hadError);
        if (logPath && !(exeErr instanceof NotSupportedError)) {
            this._logManager.logMessage(
                'AnalyzerManager run ' +
                    Translators.toAnalyzerTypeString(this._type) +
                    ' on ' +
                    args.getRoots() +
                    ' ended ' +
                    (hadError ? 'with error' : 'successfully') +
                    ', scan log was generated at ' +
                    logPath,
                hadError ? 'ERR' : 'DEBUG'
            );
        }
    }

    /**
     * Copy a file that includes 'log' in its name from a given folder to the logs folder
     * @param arg - the run arguments that related this log
     * @param hadError - if true, will log result as error, otherwise success.
     * @param copyToDirectory - optional destination to copy the log
     */
    private copyRunLogToFolder(args: RunArgs, hadError: boolean, copyToDirectory: string = ScanUtils.getLogsPath()): string | undefined {
        let logFile: string | undefined = fs.readdirSync(args.directory).find(fileName => fileName.toLowerCase().includes('log'));
        if (!logFile) {
            return undefined;
        }

        let roots: string[] = args.getRoots();
        let logFinalPath: string = path.join(
            copyToDirectory,
            LogUtils.getLogFileName(
                roots.map(root => Utils.getLastSegment(root)).join('_'),
                Translators.toAnalyzerTypeString(this._type),
                '' + Date.now()
            )
        );

        fs.copyFileSync(path.join(args.directory, logFile), logFinalPath);
        LogUtils.cleanUpOldLogs();

        return logFinalPath;
    }

    /**
     * Perform the binary run, with an option to abort on signal in 3 steps :
     * 1. Save the request in a given path
     * 2. Run the binary
     * 3. Collect the responses for each run in the request
     * @param checkCancel - check if cancel
     * @param request - the request to perform in YAML format
     * @param requestPath - the path that the request will be
     * @param responsePaths - the path of the response for each request in the run
     * @returns the response from all the binary runs
     */
    public async runRequest(
        checkCancel: () => void,
        request: string,
        requestPath: string,
        ...responsePaths: string[]
    ): Promise<AnalyzerScanResponse> {
        // 1. Save requests as yaml file in folder
        fs.writeFileSync(requestPath, request);
        // 2. Run the binary
        await this.runBinary(requestPath, this._verbose ? undefined : path.dirname(requestPath), checkCancel).catch(error => {
            if (error.code) {
                // Not entitled to run binary
                if (error.code === BinaryRunner.NOT_ENTITLED) {
                    throw new NotEntitledError();
                }
                if (error.code === BinaryRunner.NOT_SUPPORTED) {
                    throw new NotSupportedError(Translators.toAnalyzerTypeString(this._type));
                }
                if (error.code === BinaryRunner.OS_NOT_SUPPORTED) {
                    throw new OsNotSupportedError(Translators.toAnalyzerTypeString(this._type));
                }
                this._logManager.logMessage(
                    "Binary '" + Translators.toAnalyzerTypeString(this._type) + "' task ended with status code: " + error.code,
                    'ERR'
                );
            }
            throw error;
        });
        // 3. Collect responses
        let analyzerScanResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (const responsePath of responsePaths) {
            if (!fs.existsSync(responsePath)) {
                throw new Error(
                    "Running '" + Translators.toAnalyzerTypeString(this._type) + "' binary didn't produce response.\nRequest: " + request
                );
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
