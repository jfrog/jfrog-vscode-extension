import { LogManager } from '../../log/logManager';
import { BinaryRunner } from './binaryRunner';
import { AnalyzeIssue, AnalyzerScanRun, AnalyzeScanRequest, FileIssues } from './analyzerModels';
import { ConnectionManager } from '../../connect/connectionManager';

/**
 * The request that is sent to the binary to scan applicability
 */
export interface ApplicabilityScanRequest extends AnalyzeScanRequest {
    grep_disable: boolean; // alway false for now -> build option for it
    cve_whitelist: string[]; // can be always empty but should contain optional to reduce time
    skipped_folders: string[]; // empty but make sure there is option, for now its list of folder but should be pattern in future
}

/**
 * The response that is generated from the binary after scanning applicability
 */
export interface ApplicabilityScanResponse {
    scannedCve: string[]; // not applicable if key in here but not in below
    applicableCve: { [cve_id: string]: CveApplicableDetails }; // is applicable if key in here
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
    constructor(connectionManager: ConnectionManager, abortCheckInterval: number, logManager: LogManager) {
        super(connectionManager, abortCheckInterval, logManager);
    }

    /** @override */
    public async runBinary(abortSignal: AbortSignal, yamlConfigPath: string): Promise<void> {
        await this.executeBinary(abortSignal, ['ca', yamlConfigPath]);
    }

    /** @override */
    public asAnalyzerRequestString(...requests: AnalyzeScanRequest[]): string {
        let str: string = super.asAnalyzerRequestString(...requests);
        return str.replace('cve_whitelist', 'cve-whitelist').replace('skipped_folders', 'skipped-folders');
    }

    /**
     * Scan for applicability issues
     * @param directory - the directory the scan will perform on its files
     * @param abortController - the controller that signals abort for the operation
     * @param cvesToRun - the CVEs to run the scan on
     * @param skipFolders - the subfolders inside the directory to exclude from the scan
     * @returns the response generated from the scan
     */
    public async scan(
        directory: string,
        abortController: AbortController,
        cvesToRun: string[] = [],
        skipFolders: string[] = []
    ): Promise<ApplicabilityScanResponse> {
        let request: ApplicabilityScanRequest = {
            type: 'analyze-applicability',
            roots: [directory],
            cve_whitelist: cvesToRun,
            skipped_folders: skipFolders
        } as ApplicabilityScanRequest;
        return this.run(abortController, false, request).then(response => this.generateResponse(response?.runs[0]));
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateResponse(run: AnalyzerScanRun | undefined): ApplicabilityScanResponse {
        if (!run) {
            return {} as ApplicabilityScanResponse;
        }
        // Prepare
        let applicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();
        let scanned: Set<string> = new Set<string>();
        let rulesFullDescription: Map<string, string> = new Map<string, string>();
        for (const rule of run.tool.driver.rules) {
            rulesFullDescription.set(rule.id, rule.fullDescription.text);
        }
        let issues: AnalyzeIssue[] = run.results;
        if (issues) {
            // Generate applicable data for all the issues
            issues.forEach(analyzeIssue => {
                if ((!analyzeIssue.kind || analyzeIssue.kind === 'fail') && analyzeIssue.locations) {
                    let applicableDetails: CveApplicableDetails = this.getOrCreateApplicableDetails(
                        analyzeIssue,
                        applicable,
                        rulesFullDescription.get(analyzeIssue.ruleId)
                    );
                    analyzeIssue.locations.forEach(location => {
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
