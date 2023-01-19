import * as path from 'path';
import * as os from 'os';

import { LogManager } from '../../log/logManager';
import { BinaryRunner } from './binaryRunner';
import { ScanUtils } from '../../utils/scanUtils';
import { AnalyzeIssue, AnalyzerScanResponse, AnalyzeScanRequest, AnalyzeLocation, FileRegion, FileLocation } from './analyzerModels';
import { AnalyzerUtils } from '../../treeDataProviders/utils/analyzerUtils';

export interface EosScanRequest extends AnalyzeScanRequest {
    language: LanguageType;
}

export type LanguageType = 'python';

export interface EosScanResponse {
    filesWithIssues: EosFileIssues[];
}

export interface EosFileIssues {
    full_path: string;
    issues: EosIssue[];
}

export interface EosIssue {
    ruleId: string;
    ruleName: string;
    fullDescription?: string;
    locations: EosIssueLocation[];
}

export interface EosIssueLocation {
    region: FileRegion;
    threadFlows: FileLocation[][];
}

export class EosRunner extends BinaryRunner {
    private static readonly RUNNER_FOLDER: string = 'eos';
    private static readonly BINARY_NAME: string = 'eos_scanner';

    constructor(abortCheckInterval: number, logManager: LogManager) {
        super(path.join(ScanUtils.getHomePath(), EosRunner.RUNNER_FOLDER, EosRunner.getBinaryName()), abortCheckInterval, logManager);
    }

    protected validateSupported(): boolean {
        if (os.platform() !== 'linux' && os.platform() !== 'darwin' && os.platform() !== 'win32') {
            this._logManager.logMessage("Eos scan is not supported on '" + os.platform() + "' os", 'DEBUG');
            return false;
        }
        return super.validateSupported();
    }

    private static getBinaryName(): string {
        let name: string = EosRunner.BINARY_NAME;
        switch (os.platform()) {
            case 'linux':
                return name + '_ubuntu';
            case 'darwin':
                return name + '_macos';
            case 'win32':
                return name + '.exe';
        }
        return name;
    }

    /** @override */
    public async runBinary(abortSignal: AbortSignal, yamlConfigPath: string): Promise<void> {
        await this.executeBinary(abortSignal, ['analyze', 'config', yamlConfigPath]);
    }

    /**
     * Scan for EOS issues
     * @param abortController - the controller that signals abort for the operation
     * @param requests - requests to run
     * @returns the response generated from the scan
     */
    public async scan(abortController: AbortController, ...requests: EosScanRequest[]): Promise<EosScanResponse> {
        for (const request of requests) {
            request.type = 'analyze-codebase';
        }
        let response: EosScanResponse = await this.run(abortController, true, ...requests).then(runResult => this.generateResponse(runResult));
        return response;
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateResponse(response?: AnalyzerScanResponse): EosScanResponse {
        if (!response) {
            return {} as EosScanResponse;
        }

        let eosResponse: EosScanResponse = {
            filesWithIssues: []
        } as EosScanResponse;

        for (const run of response.runs) {
            // Prepare
            let rulesFullDescription: Map<string, string> = new Map<string, string>();
            for (const rule of run.tool.driver.rules) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
            let issues: AnalyzeIssue[] = run.results;
            if (issues) {
                // Generate response data
                issues.forEach(analyzeIssue => {
                    analyzeIssue.locations.forEach(location => {
                        let fileWithIssues: EosFileIssues = this.getOrCreateEosFileIssues(
                            eosResponse,
                            location.physicalLocation.artifactLocation.uri
                        );
                        let fileIssue: EosIssue = this.getOrCreateEosIssue(
                            fileWithIssues,
                            analyzeIssue,
                            rulesFullDescription.get(analyzeIssue.ruleId)
                        );
                        let issueLocation: EosIssueLocation = this.getOrCreateIssueLocation(fileIssue, location.physicalLocation);
                        if (analyzeIssue.codeFlows) {
                            // Check if exists flows for the current location in this issue
                            for (const codeFlow of analyzeIssue.codeFlows) {
                                for (const threadFlow of codeFlow.threadFlows) {
                                    // The last location in the threadFlow should match the location of the issue
                                    let potential: AnalyzeLocation = threadFlow.locations[threadFlow.locations.length - 1].location;
                                    if (
                                        potential.physicalLocation.artifactLocation.uri === fileWithIssues.full_path &&
                                        AnalyzerUtils.isSameRegion(potential.physicalLocation.region, issueLocation.region)
                                    ) {
                                        let locations: FileLocation[] = threadFlow.locations.map(location => location.location.physicalLocation);
                                        for (let fileLocation of locations) {
                                            fileLocation.artifactLocation.uri = AnalyzerUtils.parseLocationFilePath(
                                                fileLocation.artifactLocation.uri
                                            );
                                        }
                                        issueLocation.threadFlows.push(locations);
                                    }
                                }
                            }
                        }
                    });
                });
            }
        }
        return eosResponse;
    }

    /**
     * Get or create issue location base on a given file location
     * @param fileIssue - the issue that holds all the locations
     * @param physicalLocation - the location to search or create
     * @returns issue location
     */
    private getOrCreateIssueLocation(fileIssue: EosIssue, physicalLocation: FileLocation): EosIssueLocation {
        // TODO: There could be multiple stack trace for each location with issue, uncomment when webview can handle this.
        // let potential: EosIssueLocation | undefined = fileIssue.locations.find(location => AnalyzerUtils.isSameRegion(location.region,physicalLocation.region));
        // if(potential) {
        //     return potential;
        // }
        let location: EosIssueLocation = {
            region: physicalLocation.region,
            threadFlows: []
        } as EosIssueLocation;
        fileIssue.locations.push(location);
        return location;
    }

    /**
     * Get or create issue in a given file if not exists
     * @param fileWithIssues - the file with the issues
     * @param analyzeIssue - the issue to search or create
     * @param fullDescription - the description of the issue
     * @returns - the eos issue
     */
    private getOrCreateEosIssue(fileWithIssues: EosFileIssues, analyzeIssue: AnalyzeIssue, fullDescription?: string): EosIssue {
        let potential: EosIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === analyzeIssue.ruleId);
        if (potential) {
            return potential;
        }
        let fileIssue: EosIssue = {
            ruleId: analyzeIssue.ruleId,
            ruleName: analyzeIssue.message.text,
            fullDescription: fullDescription,
            locations: []
        } as EosIssue;
        fileWithIssues.issues.push(fileIssue);
        return fileIssue;
    }

    /**
     * Get or create file with issues if not exists in the response
     * @param response - the response that holds the files
     * @param uri - the files to search or create
     * @returns - file with issues
     */
    private getOrCreateEosFileIssues(response: EosScanResponse, uri: string): EosFileIssues {
        let potential: EosFileIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === uri);
        if (potential) {
            return potential;
        }
        let fileWithIssues: EosFileIssues = {
            full_path: uri,
            issues: []
        } as EosFileIssues;
        response.filesWithIssues.push(fileWithIssues);

        return fileWithIssues;
    }
}
