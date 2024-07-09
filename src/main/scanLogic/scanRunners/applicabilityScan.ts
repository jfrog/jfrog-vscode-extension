import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { CveTreeNode } from '../../treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { ProjectDependencyTreeNode } from '../../treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { IssueTreeNode } from '../../treeDataProviders/issuesTree/issueTreeNode';
import { AnalyzerUtils } from '../../treeDataProviders/utils/analyzerUtils';
import { StepProgress } from '../../treeDataProviders/utils/stepProgress';
import { PackageType, fromPackageType } from '../../types/projectType';
import { DependencyScanResults } from '../../types/workspaceIssuesDetails';
import { Configuration } from '../../utils/configuration';
import { AppsConfigModule } from '../../utils/jfrogAppsConfig/jfrogAppsConfig';
import { FileScanBundle } from '../../utils/scanUtils';
import { Utils } from '../../utils/utils';
import { AnalyzerManager } from './analyzerManager';
import { AnalyzeIssue, AnalyzeLocation, AnalyzeScanRequest, AnalyzerScanResponse, AnalyzerScanRun, FileIssues, ScanType } from './analyzerModels';
import { BinaryEnvParams, JasRunner, RunArgs } from './jasRunner';

/**
 * The request that is sent to the binary to scan applicability
 */
export interface ApplicabilityScanArgs extends AnalyzeScanRequest {
    // Not used
    grep_disable: boolean;
    // Must have at least one item, the CVE to search for in scan
    cve_whitelist: string[];
    indirect_cve_whitelist: string[];
}

/**
 * The response that is generated from the binary after scanning applicability
 */
export interface ApplicabilityScanResponse {
    // All the direct cve that were scanned (have data about them in analyzer)
    scannedCve: string[];
    // All the indirect cves that should be scanned
    indirectCve: string[];
    // All the cve that have applicable issues
    applicableCve: { [cve_id: string]: CveApplicableDetails };
    // All the cve that have non-applicable issues
    nonapplicableCve: string[];
}

/**
 * The details about cve applicability result
 */
export interface CveApplicableDetails {
    fixReason: string;
    fileEvidences: FileIssues[];
    fullDescription?: string;
}

export class BundleCves extends Map<FileScanBundle, [Set<string>, Set<string>]> {}

/**
 * Describes a runner for the Applicability scan.
 */
export class ApplicabilityRunner extends JasRunner {
    public static readonly ENV_PACKAGE_MANAGER: string = 'AM_PACKAGE_MANAGER';

    constructor(
        private _bundlesWithIssues: FileScanBundle[],
        private _packageType: PackageType,
        private _progressManager: StepProgress,
        connectionManager: ConnectionManager,
        logManager: LogManager,
        analyzerManager: AnalyzerManager
    ) {
        super(connectionManager, ScanType.AnalyzeApplicability, logManager, new AppsConfigModule(__dirname), analyzerManager);
    }

    /** @override */
    protected async runBinary(checkCancel: () => void, args: RunArgs, params?: BinaryEnvParams): Promise<void> {
        await this.runAnalyzerManager(checkCancel, ['ca', args.request.requestPath], this.createApplicabilityEnv(params));
    }

    private createApplicabilityEnv(params?: BinaryEnvParams): NodeJS.ProcessEnv | undefined {
        let env: NodeJS.ProcessEnv | undefined = this._analyzerManager.createEnvForRun(params);
        if (!env) {
            return;
        }
        env[ApplicabilityRunner.ENV_PACKAGE_MANAGER] = fromPackageType(this._packageType);
        return env;
    }

    /** @override */
    public requestsToYaml(...requests: AnalyzeScanRequest[]): string {
        let str: string = super.requestsToYaml(...requests);
        return str.replace('cve_whitelist', 'cve-whitelist').replace('indirect_cve_whitelist', 'indirect-cve-whitelist');
    }

    /** @override */
    public shouldRun(): boolean {
        if (!super.shouldRun()) {
            return false;
        }
        if (this._bundlesWithIssues.length === 0) {
            this._logManager.debug('Skipping applicability scan while there is no CVEs to scan');
            return false;
        }
        return true;
    }

    /** @override */
    protected logStartScanning(request: ApplicabilityScanArgs, msi?: string): void {
        let msg: string = `Scanning directories '${request.roots}', for ${this._scanType} issues: ${request.cve_whitelist} indirect issues: ${request.indirect_cve_whitelist}`;
        if (msi) {
            msg += `\nMultiScanId: ${msi}`;
        }
        msg += ` Skipping folders: ${request.skipped_folders}`;
        this._logManager.logMessage(msg, 'DEBUG');
    }

    /**
     * Scan for applicability issues
     */
    public async scan(params?: BinaryEnvParams): Promise<void> {
        let filteredBundles: BundleCves = this.filterBundlesWithoutIssuesToScan();
        let workspaceToBundles: Map<string, BundleCves> = this.mapBundlesForApplicableScanning(filteredBundles);
        if (workspaceToBundles.size == 0) {
            return;
        }
        let excludePatterns: string[] = AnalyzerUtils.getAnalyzerManagerExcludePatterns(Configuration.getScanExcludePattern());
        for (let [workspacePath, bundles] of workspaceToBundles) {
            // Unpack the direct & indirect CVEs
            const directCveSets: Set<string>[] = [];
            const indirectCveSets: Set<string>[] = [];
            for (const cvesTuple of bundles.values()) {
                directCveSets.push(cvesTuple[0]);
                indirectCveSets.push(cvesTuple[1]);
            }

            const cveToScan: Set<string> = Utils.combineSets(directCveSets);
            const indirectCveToScan: Set<string> = Utils.combineSets(indirectCveSets);
            // Scan workspace for all cve in relevant bundles
            let startApplicableTime: number = Date.now();

            const request: ApplicabilityScanArgs = {
                type: ScanType.AnalyzeApplicability,
                roots: [workspacePath],
                cve_whitelist: Array.from(cveToScan),
                indirect_cve_whitelist: Array.from(indirectCveToScan),
                skipped_folders: excludePatterns
            } as ApplicabilityScanArgs;

            // Merge the direct and indirect CVEs
            const mergedBundles: Map<FileScanBundle, Set<string>> = new Map<FileScanBundle, Set<string>>();
            for (const [fileScanBundle, cvesTuple] of bundles) {
                mergedBundles.set(fileScanBundle, Utils.combineSets(cvesTuple));
            }

            this.logStartScanning(request, params?.msi);
            let response: AnalyzerScanResponse | undefined = await this.executeRequest(this._progressManager.checkCancel, request, params);
            let applicableIssues: ApplicabilityScanResponse = this.convertResponse(response);
            if (applicableIssues?.applicableCve) {
                this.transferApplicableResponseToBundles(applicableIssues, mergedBundles, startApplicableTime);
            }
        }
    }

    /**
     * Filter bundles without direct or indirect cves, transform the bundle list to have its relevant cve to scan set.
     * @returns Map of bundles to their sets of direct and indirect cves, with at least one for each bundle
     */
    private filterBundlesWithoutIssuesToScan(): BundleCves {
        let filtered: BundleCves = new BundleCves();
        for (let fileScanBundle of this._bundlesWithIssues) {
            if (!(fileScanBundle.dataNode instanceof ProjectDependencyTreeNode)) {
                // Filter non dependencies projects
                continue;
            }
            const cvesToScan: Set<string> = new Set<string>();
            const indirectCvesToScan: Set<string> = new Set<string>();
            fileScanBundle.dataNode.issues.forEach((issue: IssueTreeNode) => {
                if (!(issue instanceof CveTreeNode) || !issue.cve?.cve) {
                    return;
                }
                // For Python projects, all CVEs should be included because in some cases it is impossible to determine whether a dependency is direct.
                // Other project types should include only CVEs on direct dependencies.
                if (this._packageType === PackageType.Python || !issue.parent.indirect) {
                    cvesToScan.add(issue.cve.cve);
                } else {
                    indirectCvesToScan.add(issue.cve.cve);
                }
            });
            if (cvesToScan.size == 0 && indirectCvesToScan.size == 0) {
                // Nothing to do in bundle
                continue;
            }

            filtered.set(fileScanBundle, [cvesToScan, indirectCvesToScan]);
        }

        return filtered;
    }

    /**
     * Create a mapping between a workspace and all the given bundles that relevant to it.
     * @param filteredBundles - bundles to map
     * @returns mapped bundles to similar workspace
     */
    private mapBundlesForApplicableScanning(filteredBundles: BundleCves): Map<string, BundleCves> {
        let workspaceToScanBundles: Map<string, BundleCves> = new Map<string, BundleCves>();

        for (let [fileScanBundle, cvesTuple] of filteredBundles) {
            let descriptorIssues: DependencyScanResults = <DependencyScanResults>fileScanBundle.data;
            // Map information to similar directory space
            let workspacePath: string = AnalyzerUtils.getWorkspacePath(fileScanBundle.dataNode, descriptorIssues.fullPath);
            if (!workspaceToScanBundles.has(workspacePath)) {
                workspaceToScanBundles.set(workspacePath, new BundleCves());
            }
            workspaceToScanBundles.get(workspacePath)?.set(fileScanBundle, cvesTuple);
            this._logManager.logMessage('Adding data from descriptor ' + descriptorIssues.fullPath + ' for cve applicability scan', 'INFO');
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
        // Map from Applicable CVE ID to CveApplicableDetails
        let applicableCvesIdToDetails: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>(
            Object.entries(scanResponse.applicableCve)
        );
        let relevantScannedCve: string[] = [];
        let relevantApplicableCve: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();

        for (let scannedCve of scanResponse.scannedCve) {
            if (relevantCve.has(scannedCve)) {
                relevantScannedCve.push(scannedCve);
                let potential: CveApplicableDetails | undefined = applicableCvesIdToDetails.get(scannedCve);
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
        const analyzerScanRun: AnalyzerScanRun = response.runs[0];
        const applicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();
        const nonapplicable: string[] = [];
        const scanned: Set<string> = new Set<string>();
        const rulesFullDescription: Map<string, string> = new Map<string, string>();
        for (const rule of analyzerScanRun.tool.driver.rules) {
            if (rule.fullDescription) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
        }
        const issues: AnalyzeIssue[] = analyzerScanRun.results;
        if (issues) {
            // Generate applicable data for all the issues
            issues.forEach((analyzeIssue: AnalyzeIssue) => {
                if ((!analyzeIssue.kind || analyzeIssue.kind === 'fail') && analyzeIssue.locations) {
                    const applicableDetails: CveApplicableDetails = this.getOrCreateApplicableDetails(
                        analyzeIssue,
                        applicable,
                        rulesFullDescription.get(analyzeIssue.ruleId)
                    );
                    analyzeIssue.locations.forEach((location: AnalyzeLocation) => {
                        let fileIssues: FileIssues = this.getOrCreateFileIssues(applicableDetails, location.physicalLocation.artifactLocation.uri);
                        fileIssues.locations.push(location.physicalLocation.region);
                    });
                    scanned.add(this.getCveFromRuleId(analyzeIssue.ruleId));
                } else if (analyzeIssue.kind === 'pass') {
                    nonapplicable.push(this.getCveFromRuleId(analyzeIssue.ruleId));
                    scanned.add(this.getCveFromRuleId(analyzeIssue.ruleId));
                } else {
                    this._logManager.logMessage(`${this.getCveFromRuleId(analyzeIssue.ruleId)} is not covered by contextual analysis scan`, 'DEBUG');
                }
            });
        }
        // Convert data to a response
        return {
            scannedCve: Array.from(scanned),
            applicableCve: Object.fromEntries(applicable.entries()),
            nonapplicableCve: nonapplicable
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
