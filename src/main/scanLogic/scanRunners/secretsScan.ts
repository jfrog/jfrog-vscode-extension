import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { IssuesRootTreeNode } from '../../treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils, FileWithSecurityIssues } from '../../treeDataProviders/utils/analyzerUtils';
import { StepProgress } from '../../treeDataProviders/utils/stepProgress';
import { Module } from '../../types/jfrogAppsConfig';
import { ScanResults } from '../../types/workspaceIssuesDetails';
import { AppsConfigUtils } from '../../utils/appConfigUtils';
import { Resource } from '../../utils/resource';
import { ScanUtils } from '../../utils/scanUtils';
import { ScanManager } from '../scanManager';
import { AnalyzeScanRequest, AnalyzerScanResponse, ScanType } from './analyzerModels';
import { JasScanner } from './binaryRunner';

export interface SecretsScanResponse {
    filesWithIssues: FileWithSecurityIssues[];
}

/**
 * Describes a runner for the Secrets scan executable file.
 */
export class SecretsRunner extends JasScanner {
    constructor(
        connectionManager: ConnectionManager,
        logManager: LogManager,
        module: Module,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.Secrets, logManager, module, binary);
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string | undefined, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['sec', yamlConfigPath], executionLogDirectory);
    }

    /**
     * Run Secrets scan async task and populate the given bundle with the results.
     * @param scanResults - the data object that will be populated with the results
     * @param root - the view object that will be populated with the results
     * @param scanManager - the ScanManager that preforms the actual scans
     * @param module - the module that will be scanned
     * @param progressManager - the progress for the given scan
     */
    public async scan(scanResults: ScanResults, root: IssuesRootTreeNode, scanManager: ScanManager, progressManager: StepProgress): Promise<void> {
        let startSecretsTime: number = Date.now();
        let request: AnalyzeScanRequest = {
            type: ScanType.Secrets,
            roots: AppsConfigUtils.GetSourceRoots(this._module, this._module.scanners?.secrets),
            skipped_folders: AppsConfigUtils.GetExcludePatterns(this._module, this._module.scanners?.secrets)
        } as AnalyzeScanRequest;
        this._logManager.logMessage(
            "Scanning directories '" + request.roots + "', for secrets. Skipping folders: " + request.skipped_folders,
            'DEBUG'
        );
        let response: SecretsScanResponse = await this.run(progressManager.checkCancel, request).then(runResult => this.convertResponse(runResult));
        if (response) {
            scanResults.secretsScan = response;
            scanResults.secretsScanTimestamp = Date.now();
            let issuesCount: number = AnalyzerUtils.populateSecretsIssues(root, scanResults);
            scanManager.logManager.logMessage(
                'Found ' +
                    issuesCount +
                    " Secret issues in workspace = '" +
                    scanResults.path +
                    "' (elapsed " +
                    (scanResults.secretsScanTimestamp - startSecretsTime) / 1000 +
                    ' seconds)',
                'INFO'
            );
            root.apply();
        }
        progressManager.reportProgress();
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public convertResponse(response?: AnalyzerScanResponse): SecretsScanResponse {
        if (!response) {
            return {} as SecretsScanResponse;
        }
        let secretsResponse: SecretsScanResponse = {
            filesWithIssues: []
        } as SecretsScanResponse;

        for (const run of response.runs) {
            // Get the full descriptions of all rules
            let rulesFullDescription: Map<string, string> = new Map<string, string>();
            for (const rule of run.tool.driver.rules) {
                if (rule.fullDescription) {
                    rulesFullDescription.set(rule.id, rule.fullDescription.text);
                }
            }
            // Generate response data
            run.results?.forEach(analyzeIssue => {
                if (analyzeIssue.suppressions && analyzeIssue.suppressions.length > 0) {
                    // Suppress issue
                    return;
                }
                AnalyzerUtils.generateIssueData(secretsResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId));
            });
        }
        return secretsResponse;
    }
}
