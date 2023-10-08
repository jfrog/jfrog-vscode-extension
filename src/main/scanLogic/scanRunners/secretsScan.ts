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
import { AnalyzeScanRequest, AnalyzerScanResponse, AnalyzerScanRun, ScanType } from './analyzerModels';
import { JasRunner } from './jasRunner';

export interface SecretsScanResponse {
    filesWithIssues: FileWithSecurityIssues[];
}

/**
 * Describes a runner for the Secrets scan executable file.
 */
export class SecretsRunner extends JasRunner {
    constructor(
        private _scanResults: ScanResults,
        private _root: IssuesRootTreeNode,
        private _progressManager: StepProgress,
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
     */
    public async scan(): Promise<void> {
        let startTime: number = Date.now();
        let request: AnalyzeScanRequest = {
            type: ScanType.Secrets,
            roots: AppsConfigUtils.GetSourceRoots(this._module, this._module.scanners?.secrets),
            skipped_folders: AppsConfigUtils.GetExcludePatterns(this._module, this._module.scanners?.secrets)
        } as AnalyzeScanRequest;
        super.logStartScanning(request);
        let response: SecretsScanResponse = await this.executeRequest(this._progressManager.checkCancel, request).then(runResult =>
            this.convertResponse(runResult)
        );
        if (response) {
            this._scanResults.secretsScan = response;
            this._scanResults.secretsScanTimestamp = Date.now();
            let issuesCount: number = AnalyzerUtils.populateSecretsIssues(this._root, this._scanResults);
            super.logNumberOfIssues(issuesCount, this._scanResults.path, startTime, this._scanResults.secretsScanTimestamp);
            this._root.apply();
        }
        this._progressManager.reportProgress();
    }

    /**
     * Generate response from the run results
     * @param response - Run results generated from the binary
     * @returns the response generated from the scan run
     */
    public convertResponse(response?: AnalyzerScanResponse): SecretsScanResponse {
        if (!response) {
            return {} as SecretsScanResponse;
        }
        let analyzerScanRun: AnalyzerScanRun = response.runs[0];
        let secretsResponse: SecretsScanResponse = {
            filesWithIssues: []
        } as SecretsScanResponse;

        // Get the full descriptions of all rules
        let rulesFullDescription: Map<string, string> = new Map<string, string>();
        for (const rule of analyzerScanRun.tool.driver.rules) {
            if (rule.fullDescription) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
        }
        // Generate response data
        analyzerScanRun.results?.forEach(analyzeIssue => {
            if (analyzeIssue.suppressions && analyzeIssue.suppressions.length > 0) {
                // Suppress issue
                return;
            }
            AnalyzerUtils.generateIssueData(secretsResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId));
        });
        return secretsResponse;
    }
}
