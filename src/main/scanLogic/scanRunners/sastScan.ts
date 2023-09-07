import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { AnalyzerUtils } from '../../treeDataProviders/utils/analyzerUtils';
import { Module, SastScanner } from '../../types/jfrogAppsConfig';
import { Severity } from '../../types/severity';
import { AppsConfigUtils } from '../../utils/appConfigUtils';
import { Resource } from '../../utils/resource';
import { ScanUtils } from '../../utils/scanUtils';
import { Translators } from '../../utils/translators';
import {
    AnalyzeIssue,
    AnalyzeLocation,
    AnalyzeScanRequest,
    AnalyzerScanResponse,
    CodeFlow,
    FileLocation,
    FileRegion,
    ScanType
} from './analyzerModels';
import { BinaryRunner } from './binaryRunner';

/**
 * The request that is sent to the binary to scan Sast
 */
export interface SastScanRequest extends AnalyzeScanRequest {
    language: LanguageType;
    exclude_patterns: string[];
    excluded_rules: string[];
}

export type LanguageType = 'python' | 'javascript' | 'typescript' | 'java';

export interface SastScanResponse {
    filesWithIssues: SastFileIssues[];
}

export interface SastFileIssues {
    full_path: string;
    issues: SastIssue[];
}

export interface SastIssue {
    ruleId: string;
    severity: Severity;
    ruleName: string;
    fullDescription?: string;
    locations: SastIssueLocation[];
}

export interface SastIssueLocation {
    region: FileRegion;
    threadFlows: FileLocation[][];
}

export class SastRunner extends BinaryRunner {
    constructor(
        connectionManager: ConnectionManager,
        logManager: LogManager,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.Sast, logManager, binary);
    }

    /** @override */
    protected async runBinary(
        yamlConfigPath: string,
        executionLogDirectory: string | undefined,
        checkCancel: () => void,
        responsePath: string
    ): Promise<void> {
        await this.executeBinary(checkCancel, ['zd', yamlConfigPath, responsePath], executionLogDirectory);
    }

    /** @override */
    public requestsToYaml(...requests: AnalyzeScanRequest[]): string {
        let str: string = super.requestsToYaml(...requests);
        return str.replace('excluded_rules', 'excluded-rules');
    }

    /**
     * Scan for SAST issues
     * @param module - the module that will be scanned
     * @param checkCancel - check if cancel
     * @returns the response generated from the scan
     */
    public async scan(module: Module, checkCancel: () => void): Promise<SastScanResponse> {
        let sastScanner: SastScanner | undefined = module.scanners?.sast;
        let request: SastScanRequest = {
            type: ScanType.Sast,
            roots: AppsConfigUtils.GetSourceRoots(module, sastScanner),
            language: sastScanner?.language,
            excluded_rules: sastScanner?.excluded_rules,
            exclude_patterns: AppsConfigUtils.GetExcludePatterns(module, sastScanner)
        } as SastScanRequest;
        this._logManager.logMessage(
            "Scanning directories '" + request.roots + "', for SAST issues. Skipping folders: " + request.exclude_patterns,
            'DEBUG'
        );

        return await this.run(checkCancel, request).then(runResult => this.generateScanResponse(runResult));
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateScanResponse(response?: AnalyzerScanResponse): SastScanResponse {
        if (!response) {
            return {} as SastScanResponse;
        }
        let sastResponse: SastScanResponse = {
            filesWithIssues: []
        } as SastScanResponse;

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
                this.generateIssueData(sastResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId));
            });
        }
        return sastResponse;
    }

    /**
     * Generate the data for a specific analyze issue (the file object, the issue in the file object and all the location objects of this issue).
     * If the issue also contains codeFlow generate the needed information for it as well
     * @param sastResponse - the response of the scan that holds all the file objects
     * @param analyzeIssue - the issue to handle and generate information base on it
     * @param fullDescription - the description of the analyzeIssue
     */
    public generateIssueData(sastResponse: SastScanResponse, analyzeIssue: AnalyzeIssue, fullDescription?: string) {
        analyzeIssue.locations.forEach(location => {
            let fileWithIssues: SastFileIssues = this.getOrCreateSastFileIssues(sastResponse, location.physicalLocation.artifactLocation.uri);
            let fileIssue: SastIssue = this.getOrCreateSastIssue(fileWithIssues, analyzeIssue, fullDescription);
            let issueLocation: SastIssueLocation = this.getOrCreateIssueLocation(fileIssue, location.physicalLocation);
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
    private generateCodeFlowData(filePath: string, issueLocation: SastIssueLocation, codeFlows: CodeFlow[]) {
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
    private getOrCreateIssueLocation(fileIssue: SastIssue, physicalLocation: FileLocation): SastIssueLocation {
        // TODO: There could be multiple stack trace for each location with issue, uncomment when webview can handle this.
        // let potential: SastIssueLocation | undefined = fileIssue.locations.find(location => AnalyzerUtils.isSameRegion(location.region,physicalLocation.region));
        // if(potential) {
        //     return potential;
        // }
        let location: SastIssueLocation = {
            region: physicalLocation.region,
            threadFlows: []
        } as SastIssueLocation;
        fileIssue.locations.push(location);
        return location;
    }

    /**
     * Get or create issue in a given file if not exists
     * @param fileWithIssues - the file with the issues
     * @param analyzeIssue - the issue to search or create
     * @param fullDescription - the description of the issue
     * @returns - the sast issue
     */
    private getOrCreateSastIssue(fileWithIssues: SastFileIssues, analyzeIssue: AnalyzeIssue, fullDescription?: string): SastIssue {
        let potential: SastIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === analyzeIssue.ruleId);
        if (potential) {
            return potential;
        }
        let fileIssue: SastIssue = {
            ruleId: analyzeIssue.ruleId,
            severity: Translators.levelToSeverity(analyzeIssue.level),
            ruleName: analyzeIssue.message.text,
            fullDescription: fullDescription,
            locations: []
        } as SastIssue;
        fileWithIssues.issues.push(fileIssue);
        return fileIssue;
    }

    /**
     * Get or create file with issues if not exists in the response
     * @param response - the response that holds the files
     * @param uri - the files to search or create
     * @returns - file with issues
     */
    private getOrCreateSastFileIssues(response: SastScanResponse, uri: string): SastFileIssues {
        let potential: SastFileIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === uri);
        if (potential) {
            return potential;
        }
        let fileWithIssues: SastFileIssues = {
            full_path: uri,
            issues: []
        } as SastFileIssues;
        response.filesWithIssues.push(fileWithIssues);

        return fileWithIssues;
    }
}
