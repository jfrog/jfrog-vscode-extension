import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { CveTreeNode } from '../../treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { ProjectDependencyTreeNode } from '../../treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { IssueTreeNode } from '../../treeDataProviders/issuesTree/issueTreeNode';
import { AnalyzerUtils } from '../../treeDataProviders/utils/analyzerUtils';
import { StepProgress } from '../../treeDataProviders/utils/stepProgress';
import { Module } from '../../types/jfrogAppsConfig';
import { PackageType } from '../../types/projectType';
import { DependencyScanResults } from '../../types/workspaceIssuesDetails';
import { Configuration } from '../../utils/configuration';
import { Resource } from '../../utils/resource';
import { FileScanBundle, ScanUtils } from '../../utils/scanUtils';
import { Utils } from '../../utils/utils';
import { AnalyzeIssue, AnalyzeLocation, AnalyzeScanRequest, AnalyzerScanResponse, AnalyzerScanRun, FileIssues, ScanType } from './analyzerModels';
import { JasRunner } from './jasRunner';

/**
 * The request that is sent to the binary to scan applicability
 */
export interface ApplicabilityScanArgs extends AnalyzeScanRequest {
    // Not used
    grep_disable: boolean;
    // Must have at least one item, the CVE to search for in scan
    cve_whitelist: string[];
}

/**
 * The response that is generated from the binary after scanning applicability
 */
export interface ApplicabilityScanResponse {
    // All the cve that were scanned (have data about them in analyzer)
    scannedCve: string[];
    // All the cve that have applicable issues
    applicableCve: { [cve_id: string]: CveApplicableDetails };
}

/**
 * The details about cve applicability result
 */
export interface CveApplicableDetails {
    fixReason: string;
    fileEvidences: FileIssues[];
    fullDescription?: string;
}

/**
 * Describes a runner for the Applicability scan.
 */
export class ApplicabilityRunner extends JasRunner {
    constructor(
        private _bundlesWithIssues: FileScanBundle[],
        private _packageType: PackageType,
        private _progressManager: StepProgress,
        connectionManager: ConnectionManager,
        logManager: LogManager,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.ContextualAnalysis, logManager, {} as Module, binary);
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string | undefined, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['ca', yamlConfigPath], executionLogDirectory);
    }

    /** @override */
    public requestsToYaml(...requests: AnalyzeScanRequest[]): string {
        let str: string = super.requestsToYaml(...requests);
        return str.replace('cve_whitelist', 'cve-whitelist');
    }

    /** @override */
    protected logStartScanning(request: ApplicabilityScanArgs): void {
        this._logManager.logMessage(
            `Scanning directory ' ${request.roots[0]} + ', for ${this._scanType} issues: ${request.cve_whitelist} Skipping folders: ${request.skipped_folders}`,
            'DEBUG'
        );
    }

    /**
     * Scan for applicability issues
     */
    public async scan(): Promise<void> {
        let filteredBundles: Map<FileScanBundle, Set<string>> = this.filterBundlesWithoutIssuesToScan(this._bundlesWithIssues, this._packageType);
        let workspaceToBundles: Map<string, Map<FileScanBundle, Set<string>>> = this.mapBundlesForApplicableScanning(
            this._logManager,
            filteredBundles
        );
        if (workspaceToBundles.size == 0) {
            return;
        }
        for (let [workspacePath, bundles] of workspaceToBundles) {
            let cveToScan: Set<string> = Utils.combineSets(Array.from(bundles.values()));
            // Scan workspace for all cve in relevant bundles
            let startApplicableTime: number = Date.now();
            let excludePatterns: string[] = AnalyzerUtils.getAnalyzerManagerExcludePatterns(Configuration.getScanExcludePattern());

            const request: ApplicabilityScanArgs = {
                type: ScanType.ContextualAnalysis,
                roots: [workspacePath],
                cve_whitelist: Array.from(cveToScan),
                skipped_folders: excludePatterns
            } as ApplicabilityScanArgs;

            this.logStartScanning(request);
            let response: AnalyzerScanResponse | undefined = await this.executeRequest(this._progressManager.checkCancel, request);
            let applicableIssues: ApplicabilityScanResponse = this.convertResponse(response);
            if (applicableIssues?.applicableCve) {
                this.transferApplicableResponseToBundles(applicableIssues, bundles, startApplicableTime);
            }
        }
    }

    /**
     * Filter bundles without direct cve issues, transform the bundle list to have its relevant cve to scan set.
     * @param fileScanBundles - Bundles to process and filter if needed
     * @param packageType     - Package type of the project
     * @returns Map of bundles to their set of direct cves issues, with at least one for each bundle
     */
    private filterBundlesWithoutIssuesToScan(fileScanBundles: FileScanBundle[], packageType: PackageType): Map<FileScanBundle, Set<string>> {
        let filtered: Map<FileScanBundle, Set<string>> = new Map<FileScanBundle, Set<string>>();

        for (let fileScanBundle of fileScanBundles) {
            if (!(fileScanBundle.dataNode instanceof ProjectDependencyTreeNode)) {
                // Filter non dependencies projects
                continue;
            }
            let cvesToScan: Set<string> = new Set<string>();
            fileScanBundle.dataNode.issues.forEach((issue: IssueTreeNode) => {
                if (!(issue instanceof CveTreeNode) || !issue.cve?.cve) {
                    return;
                }
                // For Python projects, all CVEs should be included because in some cases it is impossible to determine whether a dependency is direct.
                // Other project types should include only CVEs on direct dependencies.
                if (packageType === PackageType.Python || !issue.parent.indirect) {
                    cvesToScan.add(issue.cve.cve);
                }
            });
            if (cvesToScan.size == 0) {
                // Nothing to do in bundle
                continue;
            }

            filtered.set(fileScanBundle, cvesToScan);
        }

        return filtered;
    }

    /**
     * Create a mapping between a workspace and all the given bundles that relevant to it.
     * @param logManager      - logger to log added map
     * @param filteredBundles - bundles to map
     * @returns mapped bundles to similar workspace
     */
    private mapBundlesForApplicableScanning(
        logManager: LogManager,
        filteredBundles: Map<FileScanBundle, Set<string>>
    ): Map<string, Map<FileScanBundle, Set<string>>> {
        let workspaceToScanBundles: Map<string, Map<FileScanBundle, Set<string>>> = new Map<string, Map<FileScanBundle, Set<string>>>();

        for (let [fileScanBundle, cvesToScan] of filteredBundles) {
            let descriptorIssues: DependencyScanResults = <DependencyScanResults>fileScanBundle.data;
            // Map information to similar directory space
            let workspacePath: string = AnalyzerUtils.getWorkspacePath(fileScanBundle.dataNode, descriptorIssues.fullPath);
            if (!workspaceToScanBundles.has(workspacePath)) {
                workspaceToScanBundles.set(workspacePath, new Map<FileScanBundle, Set<string>>());
            }
            workspaceToScanBundles.get(workspacePath)?.set(fileScanBundle, cvesToScan);
            logManager.logMessage('Adding data from descriptor ' + descriptorIssues.fullPath + ' for cve applicability scan', 'INFO');
        }

        return workspaceToScanBundles;
    }

    /**
     * Transfer and populate information from a given applicable scan to each bundle
     * @param applicableIssues - Full scan response with information relevant to all the bundles
     * @param bundles          - the bundles that will be populated only with their relevant information
     * @param startTime        - The start time for the applicable scan
     */
    private transferApplicableResponseToBundles(
        applicableIssues: ApplicabilityScanResponse,
        bundles: Map<FileScanBundle, Set<string>>,
        startTime: number
    ) {
        for (let [bundle, relevantCve] of bundles) {
            let descriptorIssues: DependencyScanResults = <DependencyScanResults>bundle.data;
            // Filter only relevant information
            descriptorIssues.applicableScanTimestamp = Date.now();
            descriptorIssues.applicableIssues = this.filterApplicabilityScanResponse(applicableIssues, relevantCve);
            // Populate it in bundle
            let issuesCount: number = AnalyzerUtils.populateApplicableIssues(
                bundle.rootNode,
                <ProjectDependencyTreeNode>bundle.dataNode,
                descriptorIssues
            );
            super.logNumberOfIssues(issuesCount, descriptorIssues.fullPath, startTime, descriptorIssues.applicableScanTimestamp);
            bundle.rootNode.apply();
        }
    }

    /**
     * For a given full ApplicableScanResponse scan results, filter the results to only contain information relevant to a given cve list
     * @param scanResponse - All the applicable information
     * @param relevantCve  - CVE list to filter information only for them
     * @returns ApplicableScanResponse with information relevant only for the given relevant CVEs
     */
    private filterApplicabilityScanResponse(scanResponse: ApplicabilityScanResponse, relevantCve: Set<string>): ApplicabilityScanResponse {
        let allApplicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>(Object.entries(scanResponse.applicableCve));
        let relevantScannedCve: string[] = [];
        let relevantApplicableCve: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();

        for (let scannedCve of scanResponse.scannedCve) {
            if (relevantCve.has(scannedCve)) {
                relevantScannedCve.push(scannedCve);
                let potential: CveApplicableDetails | undefined = allApplicable.get(scannedCve);
                if (potential) {
                    relevantApplicableCve.set(scannedCve, potential);
                }
            }
        }
        return {
            scannedCve: Array.from(relevantScannedCve),
            applicableCve: Object.fromEntries(relevantApplicableCve.entries())
        } as ApplicabilityScanResponse;
    }

    /**
     * Generate response from the run results
     * @param response - The run results generated from the binary
     * @returns the response generated from the scan run
     */
    public convertResponse(response: AnalyzerScanResponse | undefined): ApplicabilityScanResponse {
        if (!response) {
            return {} as ApplicabilityScanResponse;
        }
        // Prepare
        let analyzerScanRun: AnalyzerScanRun = response.runs[0];
        let applicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();
        let scanned: Set<string> = new Set<string>();
        let rulesFullDescription: Map<string, string> = new Map<string, string>();
        for (const rule of analyzerScanRun.tool.driver.rules) {
            if (rule.fullDescription) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
        }
        let issues: AnalyzeIssue[] = analyzerScanRun.results;
        if (issues) {
            // Generate applicable data for all the issues
            issues.forEach((analyzeIssue: AnalyzeIssue) => {
                if ((!analyzeIssue.kind || analyzeIssue.kind === 'fail') && analyzeIssue.locations) {
                    let applicableDetails: CveApplicableDetails = this.getOrCreateApplicableDetails(
                        analyzeIssue,
                        applicable,
                        rulesFullDescription.get(analyzeIssue.ruleId)
                    );
                    analyzeIssue.locations.forEach((location: AnalyzeLocation) => {
                        let fileIssues: FileIssues = this.getOrCreateFileIssues(applicableDetails, location.physicalLocation.artifactLocation.uri);
                        fileIssues.locations.push(location.physicalLocation.region);
                    });
                }
                scanned.add(this.getCveFromRuleId(analyzeIssue.ruleId));
            });
        }
        // Convert data to a response
        return {
            scannedCve: Array.from(scanned),
            applicableCve: Object.fromEntries(applicable.entries())
        } as ApplicabilityScanResponse;
    }

    /**
     * Get or create if not exists file evidence from the CVE applicable issues
     * @param applicableDetails - The CVE applicable issues with the file list
     * @param filePath          - The file to search or create if not exist
     * @returns the object that represents the issues in a file for the CVE
     */
    private getOrCreateFileIssues(applicableDetails: CveApplicableDetails, filePath: string): FileIssues {
        let fileIssues: FileIssues | undefined = applicableDetails.fileEvidences.find(file => file.full_path == filePath);
        if (fileIssues) {
            return fileIssues;
        }

        fileIssues = {
            full_path: filePath,
            locations: []
        } as FileIssues;

        applicableDetails.fileEvidences.push(fileIssues);

        return fileIssues;
    }

    /**
     * Get or create CVE applicable issue if not exists from the applicable list.
     * @param analyzedIssue   - Applicable issue to generate information from
     * @param applicable      - List of all the applicable CVEs
     * @param fullDescription - Full description of the applicable issue
     * @returns the CveApplicableDetails object for the analyzedIssue CVE
     */
    private getOrCreateApplicableDetails(
        analyzedIssue: AnalyzeIssue,
        applicable: Map<string, CveApplicableDetails>,
        fullDescription?: string
    ): CveApplicableDetails {
        let ruleId: string = this.getCveFromRuleId(analyzedIssue.ruleId);
        let cveDetails: CveApplicableDetails | undefined = applicable.get(ruleId);
        if (cveDetails) {
            return cveDetails;
        }

        let details: CveApplicableDetails = {
            fixReason: analyzedIssue.message.text,
            fileEvidences: [],
            fullDescription: fullDescription
        } as CveApplicableDetails;

        applicable.set(ruleId, details);

        return details;
    }

    /**
     * Translate the ruleId to the cve id (ruleId returns as 'applic_<cve id>')
     * @param ruleId - the rule id to translate
     * @returns cve id extracted from the rule
     */
    private getCveFromRuleId(ruleId: string) {
        let startId: number = ruleId.indexOf('CVE');
        if (startId >= 0) {
            return ruleId.substring(startId);
        }
        return ruleId;
    }
}
