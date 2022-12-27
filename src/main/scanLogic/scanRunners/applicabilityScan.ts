import * as path from 'path';

import { LogManager } from '../../log/logManager';
import { ScanUtils } from '../../utils/scanUtils';
import { BinaryRunner } from './binaryRunner';
import { AnalyzeIssue, AnalyzerScanRun, AnalyzeScanRequest, FileIssues } from './analyzerModels';

export interface ApplicabilityScanRequest extends AnalyzeScanRequest {
    grep_disable: boolean; // alway false for now -> build option for it
    cve_whitelist: string[]; // can be always empty but should contain optional to reduce time
    skipped_folders: string[]; // empty but make sure there is option, for now its list of folder but should be pattern in future
}

export interface CveApplicableDetails {
    fixReason: string;
    fileEvidences: FileIssues[];
}

export interface ApplicabilityScanResponse {
    scannedCve: string[]; // not applicaible if key in here but not in below
    applicableCve: { [cve_id: string]: CveApplicableDetails }; // is applicable if key in here
}

export class ApplicabilityRunner extends BinaryRunner {
    private static readonly RUNNER_FOLDER: string = 'applicability-scan';
    private static readonly BINARY_NAME: string = 'applicability_scanner';

    constructor(logManager: LogManager) {
        super(path.join(ScanUtils.getHomePath(), ApplicabilityRunner.RUNNER_FOLDER, ApplicabilityRunner.BINARY_NAME), logManager);
    }

    /** @override */
    public async runBinary(yamlConfigPath: string) {
        return this.executeBinary(['scan', '"' + yamlConfigPath + '"'], this._runDirectory);
    }

    /** @override */
    public asAnalzerRequestString(...requests: AnalyzeScanRequest[]): string {
        let str: string = super.asAnalzerRequestString(...requests);
        return str.replace('cve_whitelist', 'cve-whitelist').replace('skipped_folders', 'skipped-folders');
    }

    public async scan(directory: string, cveToRun: string[] = [], skipFolders: string[] = []): Promise<ApplicabilityScanResponse | undefined> {
        let request: ApplicabilityScanRequest = {
            type: 'analyze-applicability',
            roots: [directory],
            cve_whitelist: cveToRun,
            skipped_folders: skipFolders
        } as ApplicabilityScanRequest;

        return this.run(false, request).then(response => this.generateResponse(response?.runs[0]));
    }

    public generateResponse(run: AnalyzerScanRun | undefined): ApplicabilityScanResponse | undefined {
        if (!run) {
            return undefined;
        }
        this._logManager.logMessage("Generating response from run " + run.tool.driver.name, 'DEBUG');
        let response: ApplicabilityScanResponse = {
            scannedCve: run.tool.driver.rules?.map(rule => this.getCveFromRuleId(rule.id))
        } as ApplicabilityScanResponse;

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

    private getOrCreateFileIssues(applicableDetails: CveApplicableDetails, filePath: string): FileIssues {
        let fileIssues: FileIssues | undefined = applicableDetails.fileEvidences.find(file => file.full_path == filePath);
        if (fileIssues) return fileIssues;

        fileIssues = {
            full_path: filePath,
            locations: []
        } as FileIssues;

        applicableDetails.fileEvidences.push(fileIssues);

        return fileIssues;
    }

    private getOrCreateApplicableDetails(
        scannedCve: string[],
        applicable: Map<string, CveApplicableDetails>,
        analyzeIssue: AnalyzeIssue
    ): CveApplicableDetails {
        let cveId: string = this.getCveFromRuleId(analyzeIssue.ruleId);
        if (!scannedCve.find(cve => cve == cveId)) {
            scannedCve.push(cveId);
        }

        let cveDetails: CveApplicableDetails | undefined = applicable.get(cveId);
        if (cveDetails && cveDetails.fixReason == analyzeIssue.message.text) return cveDetails;

        let details: CveApplicableDetails = {
            fixReason: analyzeIssue.message.text,
            fileEvidences: []
        } as CveApplicableDetails;

        // TODO: in case of multiple, change to array
        applicable.set(cveId, details);

        return details;
    }

    private getCveFromRuleId(ruleId: string) {
        let startId: number = ruleId.indexOf('CVE');
        if (startId >= 0) {
            return ruleId.substring(startId);
        }
        return ruleId;
    }
}
