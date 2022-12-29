import * as fs from 'fs';

import yaml from 'js-yaml';
import * as path from 'path';

import { LogManager } from '../../log/logManager';
import { Utils } from '../../treeDataProviders/utils/utils';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { AnalyzerRequest, AnalyzerScanResponse, AnalyzeScanRequest } from './analyzerModels';

/**
 * Arguments for running binary async
 */
interface RunArgs {
    // Should split the requests to multiple runs
    split: boolean;
    // The directory that the requests/resposnses are expected
    dir: string;
    // The requests for the run
    requests: { request: string; requestPath: string; responsePaths: string[] }[];
    // The signal to abort the operation
    signal: AbortSignal;
}

/**
 * Describes a runner for binary executable files.
 * The executable expected to be provided with a path to request file (yaml format) and produce a response file with a result
 */
export abstract class BinaryRunner {

    protected _runDirectory: string;
    private _isSupported: boolean = true;

    constructor(protected _binaryPath: string, protected _abortCheckInterval:number, protected _logManager: LogManager) {
        this._runDirectory = path.dirname(_binaryPath);
        this._isSupported = this.validateSupported();
        if (this._abortCheckInterval <= 0) {
            // Default check in 1 sec intervals
            this._abortCheckInterval = 1 * 1000; 
        }
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
     * Execute the cmd command to run the binary with given aruments and option to abort the opration.
     * Checks every this._abortCheckInterval to see if abort command was given
     * @param abortSignal - the signal to abort the opreation
     * @param args - the arguments for the command
     */
    protected async executeBinary(abortSignal: AbortSignal, args: string[]): Promise<void> {
        let tasksInfo: { activeTasks: number; signal: AbortSignal, tasks: Promise<any>[] } = { activeTasks: 1, signal: abortSignal, tasks: []};
        // Add execute cmd task
        tasksInfo.tasks.push(
            ScanUtils.executeCmdAsync('"' + this._binaryPath + '" ' + args.join(' '), this._runDirectory)
                .then(std => {
                    if (std.stdout && std.stdout.length > 0) {
                        this._logManager.logMessage(
                            "Done executing with log '" + Utils.getLastSegment(this._binaryPath) + "', log:\n" + std.stdout,
                            'DEBUG'
                        );
                    } else if (std.stderr && std.stderr.length > 0) {
                        this._logManager.logMessage(
                            "Done executing with error '" + Utils.getLastSegment(this._binaryPath) + "', error log:\n" + std.stderr,
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
     * Translate the run requests to a single analyze requset in yaml format
     * @param requests - run requests
     * @returns analyze requset in yaml format
     */
    public asAnalzerRequestString(...requests: AnalyzeScanRequest[]): string {
        return yaml.dump({
            scans: requests
        } as AnalyzerRequest);
    }

    /**
     * Populate the args.requests arguments base on the given requests information
     * @param args - the run request to populate
     * @param requests - the run requests information
     */
    private prepareRequests(args: RunArgs, ...requests: AnalyzeScanRequest[]) {
        let actualRequest: { requests: AnalyzeScanRequest[]; responsePaths: string[] } = { requests: [], responsePaths: [] };
        for (let i: number = 0; i < requests.length; i++) {
            const request: AnalyzeScanRequest = requests[i];
            if (request.roots.length > 0) {
                // Prepare request information and insert as an actual request
                const requestPath: string = path.join(args.dir, 'request_' + args.requests.length);
                const responsePath: string = path.join(args.dir, 'response_' + args.requests.length);
                request.output = responsePath;
                if (args.split) {
                    // Insert as actual request to args request
                    args.requests.push({ request: this.asAnalzerRequestString(request), requestPath: requestPath, responsePaths: [responsePath] });
                } else {
                    // Insert to actual requests
                    actualRequest.requests.push(request);
                    actualRequest.responsePaths.push(responsePath);
                }
            }
        }
        // In case the split parameter is false instert the actual requsets as a single request to the args
        if (!args.split && actualRequest.requests.length > 0) {
            args.requests.push({
                request: this.asAnalzerRequestString(...actualRequest.requests),
                requestPath: path.join(args.dir, 'request'),
                responsePaths: actualRequest.responsePaths
            });
        }
    }

    /**
     * Async task that checks if an abort signal was given every this._abortCheckInterval milisec.
     * If the active task is <= 0 the task is completed
     * @param taskInfo - object that holds the information about the active async tasks count and the abort signal for them
     */
    private async checkIfAbortedTask(taskInfo: { activeTasks: number; signal: AbortSignal; msg?: string }): Promise<void> {
        while (taskInfo.activeTasks > 0) {
            if (taskInfo.signal.aborted) {
                throw new ScanCancellationError();
            }
            await this.delay(this._abortCheckInterval);
        }
    }

    /**
     * Sleep and delay task for sleepIntervalMilliseconds
     * @param sleepIntervalMilliseconds 
     */
    private async delay(sleepIntervalMilliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sleepIntervalMilliseconds));
    }

    /**
     * Run the runner async, preform the given run requests using this binary.
     * @param abortController - the abort controller that signals on a cancle/abort request
     * @param split - if true the runner will be run seperate for all the requests otherwise all the requests will be preformed together
     * @param requests - the requst to preform using this binary
     * @returns - the binary analyzer scan response after running for all the request
     */
    public async run(
        abortController: AbortController,
        split: boolean,
        ...requests: AnalyzeScanRequest[]
    ): Promise<AnalyzerScanResponse | undefined> {
        // Prepare and validate
        if (!this._isSupported) {
            return undefined;
        }
        let args: RunArgs = {
            dir: ScanUtils.createTmpDir(),
            split: split,
            activeTasks: 0,
            requests: [],
            signal: abortController.signal
        } as RunArgs;
        this.prepareRequests(args, ...requests);
        if (args.requests.length == 0) {
            ScanUtils.removeFolder(args.dir);
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
                        if (err instanceof ScanCancellationError) {
                            ScanUtils.removeFolder(args.dir);
                            throw err;
                        }
                        this._logManager.logError(err, true);
                    })
            );
        }
        await Promise.all(runs);
        ScanUtils.removeFolder(args.dir);
        return aggResponse;
    }

    /**
     * Preform the binary run, with option to abort on signal,in 3 steps :
     * 1. Saves the request in a given path
     * 2. run the binary
     * 3. collect the responses for each run in the requset
     * @param abortSignal - signal to abort the operation
     * @param request - the request to preform in yaml format
     * @param requestPath - the path that the request will be
     * @param responsePaths - the path of the response for each request in the run
     * @returns 
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
        await this.runBinary(abortSignal, requestPath);
        // 3. Collect responses
        let aggResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (const responsePath of responsePaths) {
            if (!fs.existsSync(responsePath)) {
                throw new Error("Running '" + Utils.getLastSegment(this._binaryPath) + "' binary didn't produce response, request:\n" + request);
            }
            // Load result and parse as response
            let result: AnalyzerScanResponse = JSON.parse(fs.readFileSync(responsePath, 'utf8').toString());
            if (result && result.runs) {
                aggResponse.runs.push(...result.runs);
            }
        }
        return aggResponse;
    }

    /**
     * Check if the runner is supported and can produce responses
     */
    public get isSupported(): boolean {
        return this._isSupported;
    }
}
