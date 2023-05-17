import { LogManager } from '../../log/logManager';
import { BinaryRunner } from './binaryRunner';
import { AnalyzeIssue, AnalyzeLocation, AnalyzerScanRun, ScanType, AnalyzeScanRequest, FileIssues } from './analyzerModels';
import { ConnectionManager } from '../../connect/connectionManager';
import { Resource } from '../../utils/resource';
import { ScanUtils } from '../../utils/scanUtils';
import { PackageType } from '../../types/projectType';

/**
 * The request that is sent to the binary to scan applicability
 */
export interface ApplicabilityScanArgs extends AnalyzeScanRequest {
    // Not used
    grep_disable: boolean;
    // Must have at least one item, the CVE to search for in scan
    cve_whitelist: string[];
    // Glob Pattern represent the files (not folders) that should be skipped
    skipped_folders: string[];
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
 * Describes a runner for the Applicability scan executable file.
 */
export class ApplicabilityRunner extends BinaryRunner {
    constructor(
        connectionManager: ConnectionManager,
        logManager: LogManager,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.ContextualAnalysis, logManager, binary);
    }

    public static supportedPackageTypes(): PackageType[] {
        return [PackageType.Npm, PackageType.Yarn, PackageType.Python];
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['ca', yamlConfigPath], executionLogDirectory);
    }

    /** @override */
    public requestsToYaml(...requests: AnalyzeScanRequest[]): string {
        let str: string = super.requestsToYaml(...requests);
        return str.replace('cve_whitelist', 'cve-whitelist').replace('skipped_folders', 'skipped-folders');
    }

    /**
     * Scan for applicability issues
     * @param directory - the directory the scan will perform on its files
     * @param checkCancel - check if cancel
     * @param cvesToRun - the CVEs to run the scan on
     * @param skipFolders - the subfolders inside the directory to exclude from the scan
     * @returns the response generated from the scan
     */
    public async scan(
        directory: string,
        checkCancel: () => void,
        cveToRun: Set<string> = new Set<string>(),
        skipFolders: string[] = []
    ): Promise<ApplicabilityScanResponse> {
        const request: ApplicabilityScanArgs = {
            type: ScanType.ContextualAnalysis,
            roots: [directory],
            cve_whitelist: Array.from(cveToRun),
            skipped_folders: skipFolders
        } as ApplicabilityScanArgs;
        return await this.run(checkCancel, request).then(response => this.convertResponse(response?.runs[0]));
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public convertResponse(run: AnalyzerScanRun | undefined): ApplicabilityScanResponse {
        if (!run) {
            return {} as ApplicabilityScanResponse;
        }
        // Prepare
        let applicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();
        let scanned: Set<string> = new Set<string>();
        let rulesFullDescription: Map<string, string> = new Map<string, string>();
        for (const rule of run.tool.driver.rules) {
            if (rule.fullDescription) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
        }
        let issues: AnalyzeIssue[] = run.results;
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
     * @param applicableDetails - the CVE applicable issues with the file list
     * @param filePath - the file to search or create if not exist
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
     * @param analyzedIssue - the applicable issue to generate information from
     * @param applicable - the list of all the applicable CVEs
     * @param fullDescription - the full description of the applicable issue
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
