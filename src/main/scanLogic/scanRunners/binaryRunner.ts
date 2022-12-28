// import * as os from 'os';
import * as fs from 'fs';

// import * as tmp from 'tmp';

import yaml from 'js-yaml';

import * as path from 'path';

import { LogManager } from '../../log/logManager';
import { Utils } from '../../treeDataProviders/utils/utils';
// import { Resource } from '../../utils/resource';
import { ScanUtils } from '../../utils/scanUtils';
import { AnalyzerRequest, AnalyzerScanResponse, AnalyzeScanRequest } from './analyzerModels';

export abstract class BinaryRunner {
    protected _runDirectory: string;
    private _isSupported: boolean = true; // true if binary exists

    public readonly id: number;
    private static instanceCounter: number = 0;

    constructor(protected _binaryPath: string, protected _logManager: LogManager) {
        this._runDirectory = path.dirname(_binaryPath);
        this.id = BinaryRunner.instanceCounter++;
        this._isSupported = this.validateSupported();
    }

    public abstract runBinary(yamlConfigPath: string): Promise<void>;

    protected validateSupported(): boolean {
        return fs.existsSync(this._binaryPath);
    }

    protected async executeBinary(args: string[], currentWorkspaceDirectory?: string): Promise<void> {
        await ScanUtils.executeCmdAsync('"' + this._binaryPath + '" ' + args.join(' '), currentWorkspaceDirectory)
            .then(std => {
                if (std.stdout && std.stdout.length > 0) {
                    this._logManager.logMessage("Done executing '" + Utils.getLastSegment(this._binaryPath) + "', log:\n" + std.stdout, 'DEBUG');
                }
            })
            .catch(err => {
                if (err) {
                    this._logManager.logError(err, true);
                }
            });
    }

    public asAnalzerRequestString(...requests: AnalyzeScanRequest[]): string {
        return yaml.dump({
            scans: requests
        } as AnalyzerRequest);
    }

    public async run(split: boolean = true, ...requests: AnalyzeScanRequest[]): Promise<AnalyzerScanResponse | undefined> {
        if (!this._isSupported) {
            return undefined;
        }
        // Prepare and validate
        let runDir: string = ScanUtils.createTmpDir();
        let actualRequests: { request: string; requestPath: string; responsePaths: string[] }[] = [];
        let aggRequest: { requests: AnalyzeScanRequest[]; responsePaths: string[] } = { requests: [], responsePaths: [] };
        for (let i: number = 0; i < requests.length; i++) {
            const request: AnalyzeScanRequest = requests[i];
            if (request.roots.length > 0) {
                const requestPath: string = path.join(runDir, 'request_' + actualRequests.length);
                const responsePath: string = path.join(runDir, 'response_' + actualRequests.length);
                request.output = responsePath;
                if (split) {
                    actualRequests.push({ request: this.asAnalzerRequestString(request), requestPath: requestPath, responsePaths: [responsePath] });
                } else {
                    aggRequest.requests.push(request);
                    aggRequest.responsePaths.push(responsePath);
                }
            }
        }
        if (!split && aggRequest.requests.length > 0) {
            actualRequests.push({
                request: this.asAnalzerRequestString(...aggRequest.requests),
                requestPath: path.join(runDir, 'request'),
                responsePaths: aggRequest.responsePaths
            });
        }
        if (actualRequests.length == 0) {
            this.test(runDir);
            // ScanUtils.removeFolder(runDir);
            return undefined;
        }
        // Run
        this._logManager.logMessage('Starting async binary execution for ' + actualRequests.length + ' runs in folder: ' + runDir, 'DEBUG');
        let runs: Promise<AnalyzerScanResponse>[] = [];
        for (let i: number = 0; i < actualRequests.length; i++) {
            runs.push(
                this.runRequest(actualRequests[i].request, actualRequests[i].requestPath, ...actualRequests[i].responsePaths).catch(err => {
                    this._logManager.logError(err, true);
                    return {} as AnalyzerScanResponse;
                })
            );
        }
        let responses: AnalyzerScanResponse[] = await Promise.all(runs);
        // Handle responses
        let aggResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (const response of responses) {
            if (response && response.runs) {
                aggResponse.runs.push(...response.runs);
            }
        }
        this.test(runDir);
        // ScanUtils.removeFolder(runDir);
        return aggResponse;
    }

    private test(dir: string) {
        this._logManager.logMessage('removing folder ' + dir, 'DEBUG');
        ScanUtils.removeFolder(dir);
    }

    private async runRequest(request: string, requestPath: string, ...responsePaths: string[]): Promise<AnalyzerScanResponse> {
        // TODO: remove when done debug
        let savePath: string = path.join(this._runDirectory, 'scans');
        fs.writeFileSync(
            path.join(savePath, 'raw-request-' + Utils.getLastSegment(this._binaryPath) + '-' + Utils.getLastSegment(requestPath) + '.yaml'),
            request
        );
        // Save requests as yaml file in folder
        fs.writeFileSync(requestPath, request);
        // Run the binary
        await this.runBinary(requestPath);
        this._logManager.logMessage('Done running binary, responses paths:\n' + responsePaths, 'DEBUG');
        let aggResponse: AnalyzerScanResponse = { runs: [] } as AnalyzerScanResponse;
        for (const responsePath of responsePaths) {
            if (!fs.existsSync(responsePath)) {
                this._logManager.logMessage("can't find response at path: " + responsePath, 'DEBUG');
                throw new Error("Running '" + Utils.getLastSegment(this._binaryPath) + "' binary didn't produce response, request:\n" + request);
            }
            // Load results from output and parse as response
            let result: AnalyzerScanResponse = JSON.parse(fs.readFileSync(responsePath, 'utf8').toString());
            if (result && result.runs) {
                aggResponse.runs.push(...result.runs);
            }
            // // TODO: remove when done debug
            fs.writeFileSync(
                path.join(savePath, 'raw-response-' + Utils.getLastSegment(this._binaryPath) + '-' + Utils.getLastSegment(responsePath)) + '.json',
                JSON.stringify(result)
            );
        }
        return aggResponse;
    }

    public get isSupported(): boolean {
        return this._isSupported;
    }
}
