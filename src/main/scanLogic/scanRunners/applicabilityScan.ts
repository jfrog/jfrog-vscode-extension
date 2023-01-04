import * as path from 'path';
import * as os from 'os';

import { LogManager } from '../../log/logManager';
import { ScanUtils } from '../../utils/scanUtils';
import { BinaryRunner } from './binaryRunner';
import { AnalyzeIssue, AnalyzerScanRun, AnalyzeScanRequest, FileIssues } from './analyzerModels';

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
}

/**
 * Describes a runner for the Applicability scan executable file.
 */
export class ApplicabilityRunner extends BinaryRunner {
    private static readonly RUNNER_FOLDER: string = 'applicability-scan';
    private static readonly BINARY_NAME: string = 'applicability_scanner';

    constructor(abortCheckInterval: number, logManager: LogManager) {
        super(
            path.join(ScanUtils.getHomePath(), ApplicabilityRunner.RUNNER_FOLDER, ApplicabilityRunner.getBinaryName()),
            abortCheckInterval,
            logManager
        );
    }

    private static getBinaryName(): string {
        let name: string = ApplicabilityRunner.BINARY_NAME;
        if (os.platform() === 'win32') {
            return name + '.exe';
        }
        return name;
    }

    /** @override */
    public async runBinary(abortSignal: AbortSignal, yamlConfigPath: string): Promise<void> {
        await this.executeBinary(abortSignal, ['scan', yamlConfigPath]);
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
        // Store all the rules that the run checked
        let response: ApplicabilityScanResponse = {
            scannedCve: run.tool.driver.rules?.map(rule => this.getCveFromRuleId(rule.id))
        } as ApplicabilityScanResponse;

        // Generate applicable data
        let applicable: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>();
        let issues: AnalyzeIssue[] = run.results;
        if (issues) {
            issues.forEach(analyzeIssue => {
                let applicableDetails: CveApplicableDetails = this.getOrCreateApplicableDetails(response.scannedCve, applicable, analyzeIssue);
                analyzeIssue.locations.forEach(location => {
                    let fileIssues: FileIssues = this.getOrCreateFileIssues(applicableDetails, location.physicalLocation.artifactLocation.uri);
                    fileIssues.locations.push(location.physicalLocation.region);
                });
            });
        }
        response.applicableCve = Object.fromEntries(applicable.entries());
        return response;
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
     * Get or create if not exists CVE applicable issue from applicable list.
     * Will add the CVE from the analyzedIssue to the scannedCve and get/create and insert to the applicable
     * @param scannedCve - all the scanned CVEs
     * @param applicable - the list of all the applicable CVEs
     * @param analyzedIssue - the applicable issue to generate information from
     * @returns the CveApplicableDetails object for the analyzedIssue CVE
     */
    private getOrCreateApplicableDetails(
        scannedCve: string[],
        applicable: Map<string, CveApplicableDetails>,
        analyzedIssue: AnalyzeIssue
    ): CveApplicableDetails {
        let cveId: string = this.getCveFromRuleId(analyzedIssue.ruleId);
        if (!scannedCve.find(cve => cve == cveId)) {
            scannedCve.push(cveId);
        }

        let cveDetails: CveApplicableDetails | undefined = applicable.get(cveId);
        if (cveDetails && cveDetails.fixReason == analyzedIssue.message.text) {
            return cveDetails;
        }

        let details: CveApplicableDetails = {
            fixReason: analyzedIssue.message.text,
            fileEvidences: []
        } as CveApplicableDetails;

        applicable.set(cveId, details);

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
