import { LogManager } from '../../log/logManager';
import { BinaryRunner } from './binaryRunner';
import {
    AnalyzeIssue,
    AnalyzerScanResponse,
    AnalyzeScanRequest,
    AnalyzeLocation,
    FileRegion,
    FileLocation,
    CodeFlow,
    ScanType
} from './analyzerModels';
import { ConnectionManager } from '../../connect/connectionManager';
import { AnalyzerUtils } from '../../treeDataProviders/utils/analyzerUtils';
import { Resource } from '../../utils/resource';
import { Severity } from '../../types/severity';
import { Translators } from '../../utils/translators';
import { ScanUtils } from '../../utils/scanUtils';

export interface EosScanRequest extends AnalyzeScanRequest {
    language: LanguageType;
    exclude_patterns: string[];
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
    severity: Severity;
    ruleName: string;
    fullDescription?: string;
    locations: EosIssueLocation[];
}

export interface EosIssueLocation {
    region: FileRegion;
    threadFlows: FileLocation[][];
}

export class EosRunner extends BinaryRunner {
    constructor(
        connectionManager: ConnectionManager,
        logManager: LogManager,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.Eos, logManager, binary);
    }

    public static supportedLanguages(): LanguageType[] {
        return ['python'];
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string | undefined, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['zd', yamlConfigPath], executionLogDirectory);
    }

    /**
     * Scan for EOS issues
     * @param checkCancel - check if cancel
     * @param requests - requests to run
     * @returns the response generated from the scan
     */
    public async scan(checkCancel: () => void, skipFiles: string[], ...requests: EosScanRequest[]): Promise<EosScanResponse> {
        requests.forEach(request => {
            request.type = ScanType.Eos;
            request.exclude_patterns = skipFiles;
        });
        return await this.run(checkCancel, ...requests).then(runResult => this.generateScanResponse(runResult));
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateScanResponse(response?: AnalyzerScanResponse): EosScanResponse {
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
                if (rule.fullDescription) {
                    rulesFullDescription.set(rule.id, rule.fullDescription.text);
                }
            }
            // Generate response data
            run.results?.forEach((analyzeIssue: AnalyzeIssue) => {
                if (analyzeIssue.suppressions && analyzeIssue.suppressions.length > 0) {
                    // Suppress issue
                    return;
                }
                this.generateIssueData(eosResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId));
            });
        }
        return eosResponse;
    }

    /**
     * Generate the data for a specific analyze issue (the file object, the issue in the file object and all the location objects of this issue).
     * If the issue also contains codeFlow generate the needed information for it as well
     * @param eosResponse - the response of the scan that holds all the file objects
     * @param analyzeIssue - the issue to handle and generate information base on it
     * @param fullDescription - the description of the analyzeIssue
     */
    public generateIssueData(eosResponse: EosScanResponse, analyzeIssue: AnalyzeIssue, fullDescription?: string) {
        analyzeIssue.locations.forEach(location => {
            let fileWithIssues: EosFileIssues = this.getOrCreateEosFileIssues(eosResponse, location.physicalLocation.artifactLocation.uri);
            let fileIssue: EosIssue = this.getOrCreateEosIssue(fileWithIssues, analyzeIssue, fullDescription);
            let issueLocation: EosIssueLocation = this.getOrCreateIssueLocation(fileIssue, location.physicalLocation);
            if (analyzeIssue.codeFlows) {
                this.generateCodeFlowData(fileWithIssues.full_path, issueLocation, analyzeIssue.codeFlows);
            }
        });
    }

    /**
     * Generate the code flow data.
     * Search the code flows for the given location (in a given file), the code flow belong to a location if the last location in the flow matches the given location.
     * @param filePath - the path to the file the issue location belongs to
     * @param issueLocation - the issue in a location to search code flows that belongs to it
     * @param codeFlows - all the code flows for this issue
     */
    private generateCodeFlowData(filePath: string, issueLocation: EosIssueLocation, codeFlows: CodeFlow[]) {
        // Check if exists flows for the current location in this issue
        for (const codeFlow of codeFlows) {
            for (const threadFlow of codeFlow.threadFlows) {
                // The last location in the threadFlow should match the location of the issue
                let potential: AnalyzeLocation = threadFlow.locations[threadFlow.locations.length - 1].location;
                if (
                    potential.physicalLocation.artifactLocation.uri === filePath &&
                    AnalyzerUtils.isSameRegion(potential.physicalLocation.region, issueLocation.region)
                ) {
                    let locations: FileLocation[] = threadFlow.locations.map(location => location.location.physicalLocation);
                    for (let fileLocation of locations) {
                        fileLocation.artifactLocation.uri = AnalyzerUtils.parseLocationFilePath(fileLocation.artifactLocation.uri);
                    }
                    issueLocation.threadFlows.push(locations);
                }
            }
        }
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
            severity: Translators.levelToSeverity(analyzeIssue.level),
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
