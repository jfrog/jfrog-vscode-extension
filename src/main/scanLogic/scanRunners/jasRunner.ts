import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';

import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { LogUtils } from '../../log/logUtils';
import { AppsConfigModule } from '../../utils/jfrogAppsConfig/jfrogAppsConfig';
import { NotEntitledError, NotSupportedError, OsNotSupportedError, ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { Translators } from '../../utils/translators';
import { Utils } from '../../utils/utils';
import { AnalyzeScanRequest, AnalyzerRequest, AnalyzerScanResponse, ScanType } from './analyzerModels';
import { AnalyzerManager } from './analyzerManager';

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
    public static readonly NOT_ENTITLED: number = 31;
    public static readonly NOT_SUPPORTED: number = 13;
    public static readonly OS_NOT_SUPPORTED: number = 55;

    constructor(
        protected _connectionManager: ConnectionManager,
        protected _scanType: ScanType,
        protected _logManager: LogManager,
        protected _config: AppsConfigModule,
        protected _analyzerManager: AnalyzerManager
    ) {}

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
        executionLogDirectory: string,
        checkCancel: () => void,
        responsePath: string | undefined
    ): Promise<void>;

    /**
     * @returns true if should run the JAS scanner
     */
    public shouldRun(): boolean {
        if (this._config.ShouldSkipScanner(this._scanType)) {
            this._logManager.debug('Skipping ' + this._scanType + ' scanning');
            return false;
        }
        return true;
    }

    /**
     * Execute the cmd command to run the binary with given arguments and an option to abort the operation.
     * @param checkCancel           - Check if should cancel
     * @param args                  - Arguments for the command
     * @param executionLogDirectory - Directory to save the execution log in
     */
    protected async executeBinary(checkCancel: () => void, args: string[], executionLogDirectory?: string): Promise<void> {
        await this._analyzerManager.runWithTimeout(checkCancel, args, executionLogDirectory);
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
            await this.runBinary(requestPath, path.dirname(requestPath), checkCancel, responsePath);
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
