import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { IssuesRootTreeNode } from '../../treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils } from '../../treeDataProviders/utils/analyzerUtils';
import { StepProgress } from '../../treeDataProviders/utils/stepProgress';
import { Severity } from '../../types/severity';
import { ScanResults } from '../../types/workspaceIssuesDetails';
import { AppsConfigModule } from '../../utils/jfrogAppsConfig/jfrogAppsConfig';
import { Translators } from '../../utils/translators';
import { AnalyzerManager } from './analyzerManager';
import {
    AnalyzeIssue,
    AnalyzeLocation,
    AnalyzeScanRequest,
    AnalyzerScanResponse,
    AnalyzerScanRun,
    CodeFlow,
    FileLocation,
    FileRegion,
    ScanType
} from './analyzerModels';
import { BinaryEnvParams, JasRunner, RunArgs } from './jasRunner';

/**
 * The request that is sent to the binary to scan SAST
 */
export interface SastScanRequest extends AnalyzeScanRequest {
    language: LanguageType;
    exclude_patterns: string[];
    excluded_rules: string[];
}

export type LanguageType = 'python' | 'javascript' | 'typescript' | 'java';

export interface SastScanResponse {
    filesWithIssues: SastFileIssues[];
    ignoreCount?: number;
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

export class SastRunner extends JasRunner {
    constructor(
        private _scanResults: ScanResults,
        private _root: IssuesRootTreeNode,
        private _progressManager: StepProgress,
        connectionManager: ConnectionManager,
        logManager: LogManager,
        config: AppsConfigModule,
        analyzerManager: AnalyzerManager
    ) {
        super(connectionManager, ScanType.Sast, logManager, config, analyzerManager);
    }

    /** @override */
    protected async runBinary(checkCancel: () => void, args: RunArgs, params?: BinaryEnvParams): Promise<void> {
        await this.runAnalyzerManager(
            checkCancel,
            ['zd', args.request.requestPath, args.request.responsePath],
            this._analyzerManager.createEnvForRun(params)
        );
    }

    /** @override */
    public requestsToYaml(...requests: AnalyzeScanRequest[]): string {
        let str: string = super.requestsToYaml(...requests);
        return str.replace('excluded_rules', 'excluded-rules');
    }

    /**
     * Run SAST scan async task and populate the given bundle with the results.
     */
    public async scan(params?: BinaryEnvParams): Promise<void> {
        let startTime: number = Date.now();
        let request: SastScanRequest = {
            type: this._scanType,
            roots: this._config.GetSourceRoots(this._scanType),
            language: this._config.GetScanLanguage(),
            excluded_rules: this._config.getExcludeRules(),
            exclude_patterns: this._config.GetExcludePatterns(this._scanType)
        } as SastScanRequest;
        this.logStartScanning(request, params?.msi);
        let response: AnalyzerScanResponse | undefined = await this.executeRequest(this._progressManager.checkCancel, request, params);
        let sastScanResponse: SastScanResponse = this.generateScanResponse(response);
        if (response) {
            this._scanResults.sastScan = sastScanResponse;
            this._scanResults.sastScanTimestamp = Date.now();
            let issuesCount: number = AnalyzerUtils.populateSastIssues(this._root, this._scanResults);
            super.logNumberOfIssues(issuesCount, this._scanResults.path, startTime, this._scanResults.sastScanTimestamp);
            this._root.apply();
        }
        this._progressManager.reportProgress();
    }

    /** @override */
    protected logStartScanning(request: SastScanRequest, msi?: string): void {
        let msg: string = `Scanning directories '${request.roots}', for ${this._scanType} issues.`;
        if (msi) {
            msg += `\nMultiScanId: ${msi}`;
        }
        msg += ` Skipping folders: ${request.exclude_patterns}`;
        this._logManager.logMessage(msg, 'DEBUG');
    }
    /**
     * Generate response from the run results
     * @param response - Run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateScanResponse(response?: AnalyzerScanResponse): SastScanResponse {
        if (!response) {
            return {} as SastScanResponse;
        }
        let analyzerScanRun: AnalyzerScanRun = response.runs[0];
        let sastResponse: SastScanResponse = {
            filesWithIssues: []
        } as SastScanResponse;

        // Prepare
        let rulesFullDescription: Map<string, string> = new Map<string, string>();
        for (const rule of analyzerScanRun.tool.driver.rules) {
            if (rule.fullDescription) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
        }
        // Generate response data
        let ignoreCount: number = 0;
        analyzerScanRun.results?.forEach((analyzeIssue: AnalyzeIssue) => {
            if (analyzeIssue.suppressions && analyzeIssue.suppressions.length > 0) {
                // Suppress issue
                ignoreCount++;
                return;
            }
            this.generateIssueData(sastResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId));
        });
        sastResponse.ignoreCount = ignoreCount;
        return sastResponse;
    }

    /**
     * Generate the data for a specific analyze issue (the file object, the issue in the file object and all the location objects of this issue).
     * If the issue also contains codeFlow generate the needed information for it as well
     * @param sastResponse    - Response of the scan that holds all the file objects
     * @param analyzeIssue    - Issue to handle and generate information base on it
     * @param fullDescription - The description of the analyzeIssue
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
     * @param filePath      - Path to the file the issue location belongs to
     * @param issueLocation - Issue in a location to search code flows that belongs to it
     * @param codeFlows     - All the code flows for this issue
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
