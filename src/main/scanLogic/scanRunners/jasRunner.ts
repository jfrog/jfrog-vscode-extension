import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';

import { IProxyConfig } from 'jfrog-client-js';
import { ConnectionManager } from '../../connect/connectionManager';
import { ConnectionUtils } from '../../connect/connectionUtils';
import { LogManager } from '../../log/logManager';
import { LogUtils } from '../../log/logUtils';
import { Configuration } from '../../utils/configuration';
import { AppsConfigModule } from '../../utils/jfrogAppsConfig/jfrogAppsConfig';
import { Resource } from '../../utils/resource';
import { RunUtils } from '../../utils/runUtils';
import { NotEntitledError, NotSupportedError, OsNotSupportedError, ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { Translators } from '../../utils/translators';
import { Utils } from '../../utils/utils';
import { AnalyzeScanRequest, AnalyzerRequest, AnalyzerScanResponse, ScanType } from './analyzerModels';

/**
 * Arguments for running binary async
 */
class RunArgs {
    // The requests for the run
    public request: RunRequest = {} as RunRequest;
    // The directory that the requests/responses are expected
    constructor(public readonly directory: string) {}

    public getRoots(): string[] {
        let roots: Set<string> = new Set<string>();
        this.request.roots.forEach(root => roots.add(root));
        return Array.from(roots);
    }
}

interface RunRequest {
    type: ScanType;
    requestContent: string;
    requestPath: string;
    roots: string[];
    responsePath: string;
}

/**
 * Base class for a JFrog Advanced Security scanner.
 */
export abstract class JasRunner {
    protected _verbose: boolean = false;
    protected _runDirectory: string;

    private static readonly RUNNER_NAME: string = 'analyzerManager';
    public static readonly RUNNER_VERSION: string = '1.3.2.2019257';
    private static readonly DOWNLOAD_URL: string = '/xsc-gen-exe-analyzer-manager-local/v1/';

    // 8 min
    public static readonly TIMEOUT_MILLISECS: number = 1000 * 60 * 8;

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
        protected _scanType: ScanType,
        protected _logManager: LogManager,
        protected _config: AppsConfigModule,
        protected _binary: Resource = JasRunner.getAnalyzerManagerResource(_logManager)
    ) {
        this._runDirectory = path.dirname(this._binary.fullPath);
    }

    public static getDefaultAnalyzerManagerSourceUrl(version: string = '[RELEASE]'): string {
        return Utils.addZipSuffix(JasRunner.DOWNLOAD_URL + '/' + version + '/' + Utils.getArchitecture() + '/' + JasRunner.RUNNER_NAME);
    }

    public static getDefaultAnalyzerManagerTargetPath(baseDirectory?: string): string {
        return Utils.addWinSuffixIfNeeded(path.join(baseDirectory ?? ScanUtils.getIssuesPath(), JasRunner.RUNNER_NAME, JasRunner.RUNNER_NAME));
    }

    public static getAnalyzerManagerResource(logManager: LogManager, targetPath?: string): Resource {
        return new Resource(
            this.getDefaultAnalyzerManagerSourceUrl(JasRunner.RUNNER_VERSION),
            targetPath ?? this.getDefaultAnalyzerManagerTargetPath(),
            logManager
        );
    }

    public get binary(): Resource {
        return this._binary;
    }

    public get verbose(): boolean {
        return this._verbose;
    }

    public set verbose(value: boolean) {
        this._verbose = value;
    }

    /**
     * Run full JAS scan for the specific scanner.
     */
    public abstract scan(): Promise<void>;

    /**
     * Run the executeBinary method with the provided request path
     * @param yamlConfigPath        - Path to the request
     * @param executionLogDirectory - Log file will be written to the dir
     * @param checkCancel           - Check if should cancel
     * @param responsePath          - Path to the output file
     */
    protected abstract runBinary(
        yamlConfigPath: string,
        executionLogDirectory: string | undefined,
        checkCancel: () => void,
        responsePath: string | undefined
    ): Promise<void>;

    /**
     * @returns true if should run the JAS scanner
     */
    public shouldRun(): boolean {
        if (!this.validateSupported()) {
            this._logManager.logMessage(this._scanType + ' runner could not find binary to run', 'WARN');
            return false;
        }
        if (this._config.ShouldSkipScanner(this._scanType)) {
            this._logManager.debug('Skipping ' + this._scanType + ' scanning');
            return false;
        }
        return true;
    }

    /**
     * Validates that the binary exists and can run
     * @returns true if supported false otherwise
     */
    public validateSupported(): boolean {
        return this._binary.isExists();
    }

    /**
     * Execute the cmd command to run the binary with given arguments and an option to abort the operation.
     * @param checkCancel           - Check if should cancel
     * @param args                  - Arguments for the command
     * @param executionLogDirectory - Directory to save the execution log in
     */
    protected async executeBinary(checkCancel: () => void, args: string[], executionLogDirectory?: string): Promise<void> {
        await RunUtils.runWithTimeout(JasRunner.TIMEOUT_MILLISECS, checkCancel, {
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
        let command: string = '"' + this._binary.fullPath + '" ' + args.join(' ');
        this._logManager.debug("Executing '" + command + "' in directory '" + this._runDirectory + "'");
        let std: any = await ScanUtils.executeCmdAsync(command, this._runDirectory, this.createEnvForRun(executionLogDirectory));
        if (std.stdout && std.stdout.length > 0) {
            this.logTaskResult(std.stdout, false);
        }
        if (std.stderr && std.stderr.length > 0) {
            this.logTaskResult(std.stderr, true);
        }
    }

    private logTaskResult(stdChannel: string, isErr: boolean) {
        let text: string = "Done executing '" + Translators.toAnalyzerTypeString(this._scanType) + "' with log, log:\n" + stdChannel;
        if (this._verbose) {
            console.log(text);
        }
        this._logManager.logMessage(text, isErr ? 'ERR' : 'DEBUG');
    }

    protected logStartScanning(request: AnalyzeScanRequest): void {
        this._logManager.logMessage(
            `Scanning directories '${request.roots}', for ${this._scanType} issues. Skipping folders: ${request.skipped_folders}`,
            'DEBUG'
        );
    }

    protected logNumberOfIssues(issuesCount: number, workspace: string, startTime: number, endTime: number): void {
        let elapsedTime: number = (endTime - startTime) / 1000;
        this._logManager.logMessage(
            `Found ${issuesCount} ${this._scanType} issues in workspace '${workspace}' (elapsed ${elapsedTime} seconds)`,
            'INFO'
        );
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
        binaryVars[JasRunner.ENV_PLATFORM_URL] = this._connectionManager.url;
        // Credentials information
        if (this._connectionManager.accessToken) {
            binaryVars[JasRunner.ENV_TOKEN] = this._connectionManager.accessToken;
        } else {
            binaryVars[JasRunner.ENV_USER] = this._connectionManager.username;
            binaryVars[JasRunner.ENV_PASSWORD] = this._connectionManager.password;
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
            binaryVars[JasRunner.ENV_HTTP_PROXY] = this.addOptionalProxyAuthInformation(proxyHttpUrl);
        }
        if (proxyHttpsUrl) {
            binaryVars[JasRunner.ENV_HTTPS_PROXY] = this.addOptionalProxyAuthInformation(proxyHttpsUrl);
        }
        // Optional log destination
        if (executionLogDirectory) {
            binaryVars.AM_LOG_DIRECTORY = executionLogDirectory;
        }
    }

    /**
     * Add optional proxy auth information to the base url if exists
     * @param url - Base url to add information on
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
     * Execute the input scan request.
     * @param checkCancel - Check if should cancel
     * @param request     - Request to perform in YAML format
     * @returns
     */
    public async executeRequest(checkCancel: () => void, request: AnalyzeScanRequest): Promise<AnalyzerScanResponse | undefined> {
        let args: RunArgs = this.createRunArguments(request);
        let execErr: Error | undefined;
        try {
            return await this.runRequest(checkCancel, args.request.requestContent, args.request.requestPath, args.request.responsePath);
        } catch (err) {
            execErr = <Error>err;
            if (err instanceof ScanCancellationError || err instanceof NotEntitledError || err instanceof NotSupportedError) {
                throw err;
            }
            this._logManager.logError(execErr);
        } finally {
            this.handleExecutionLog(args, execErr);
            ScanUtils.removeFolder(args.directory);
        }
        return;
    }

    /**
     * Populate the run arguments based on the given requests information
     * @param requests - Run requests information
     * @return run arguments for the given requests
     */
    private createRunArguments(request: AnalyzeScanRequest): RunArgs {
        let args: RunArgs = new RunArgs(ScanUtils.createTmpDir());

        // Prepare request information and insert as an actual request
        const requestPath: string = path.join(args.directory, 'request');
        const responsePath: string = path.join(args.directory, 'response');
        if (request.type !== ScanType.Sast) {
            request.output = responsePath;
        }
        request.type = this._scanType;
        // Add request to run
        args.request = {
            type: request.type,
            requestContent: this.requestsToYaml(request),
            requestPath: requestPath,
            roots: request.roots,
            responsePath: responsePath
        } as RunRequest;

        return args;
    }

    /**
     * Translate the run requests to a single analyze request in yaml format
     * @param requests - Run requests
     * @returns analyze request in YAML format
     */
    public requestsToYaml(...requests: AnalyzeScanRequest[]): string {
        return yaml
            .dump({
                scans: requests
            } as AnalyzerRequest)
            .replace('skipped_folders', 'skipped-folders');
    }

    private handleExecutionLog(args: RunArgs, exeErr: Error | undefined) {
        let hadError: boolean = exeErr !== undefined;
        let logPath: string | undefined = this.copyRunLogToFolder(args, hadError);
        if (logPath && !(exeErr instanceof NotSupportedError)) {
            this._logManager.logMessage(
                'AnalyzerManager run ' +
                    Translators.toAnalyzerTypeString(this._scanType) +
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
     * @param arg             - Run arguments that related this log
     * @param hadError        - If true, will log result as error, otherwise success.
     * @param copyToDirectory - Optional destination to copy the log
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
                Translators.toAnalyzerTypeString(this._scanType),
                '' + Date.now()
            )
        );

        fs.copyFileSync(path.join(args.directory, logFile), logFinalPath);
        LogUtils.cleanUpOldLogs();

        return logFinalPath;
    }

    /**
     * Perform the binary run, with an option to abort on signal in 3 steps:
     * 1. Save the request in a given path
     * 2. Run the binary
     * 3. Collect the responses for each run in the request
     * @param checkCancel  - Check if cancel
     * @param request      - Request to perform in YAML format
     * @param requestPath  - Path that the request will be
     * @param responsePath - Path of the response for request in the run
     * @returns the response from all the binary runs
     */
    public async runRequest(checkCancel: () => void, request: string, requestPath: string, responsePath: string): Promise<AnalyzerScanResponse> {
        // 1. Save requests as yaml file in folder
        fs.writeFileSync(requestPath, request);
        this._logManager.debug('Input YAML:\n' + request);

        // 2. Run the binary
        try {
            await this.runBinary(requestPath, this._verbose ? undefined : path.dirname(requestPath), checkCancel, responsePath);
        } catch (error) {
            let code: number | undefined = (<any>error).code;
            if (code) {
                // Not entitled to run binary
                if (code === JasRunner.NOT_ENTITLED) {
                    throw new NotEntitledError();
                }
                if (code === JasRunner.NOT_SUPPORTED) {
                    throw new NotSupportedError(Translators.toAnalyzerTypeString(this._scanType));
                }
                if (code === JasRunner.OS_NOT_SUPPORTED) {
                    throw new OsNotSupportedError(Translators.toAnalyzerTypeString(this._scanType));
                }
                this._logManager.logMessage(
                    "Binary '" + Translators.toAnalyzerTypeString(this._scanType) + "' task ended with status code: " + code,
                    'ERR'
                );
            }
            throw error;
        }
        // 3. Collect responses
        if (!fs.existsSync(responsePath)) {
            throw new Error(
                "Running '" + Translators.toAnalyzerTypeString(this._scanType) + "' binary didn't produce response.\nRequest: " + request
            );
        }
        // Load result and parse as response
        return JSON.parse(fs.readFileSync(responsePath, 'utf8').toString());
    }
}
