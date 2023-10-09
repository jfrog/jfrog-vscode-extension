import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { IssuesRootTreeNode } from '../../treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils, FileWithSecurityIssues } from '../../treeDataProviders/utils/analyzerUtils';
import { StepProgress } from '../../treeDataProviders/utils/stepProgress';
import { ScanResults } from '../../types/workspaceIssuesDetails';
import { AppsConfigModule } from '../../utils/jfrogAppsConfig/jfrogAppsConfig';
import { Resource } from '../../utils/resource';
import { ScanUtils } from '../../utils/scanUtils';
import { AnalyzeScanRequest, AnalyzerScanResponse, AnalyzerScanRun, ScanType } from './analyzerModels';
import { JasRunner } from './jasRunner';

export interface IacScanResponse {
    filesWithIssues: FileWithSecurityIssues[];
}

/**
 * Describes a runner for the 'Infrastructure As Code' (Iac) scan executable file.
 */
export class IacRunner extends JasRunner {
    constructor(
        private _scanResults: ScanResults,
        private _root: IssuesRootTreeNode,
        private _progressManager: StepProgress,
        connectionManager: ConnectionManager,
        logManager: LogManager,
        module: AppsConfigModule,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.Iac, logManager, module, binary);
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string | undefined, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['iac', yamlConfigPath], executionLogDirectory);
    }

    /**
     * Run IaC scan async task and populate the given bundle with the results.
     */
    public async scan(): Promise<void> {
        let startTime: number = Date.now();
        let request: AnalyzeScanRequest = {
            type: this._scanType,
            roots: this._module.GetSourceRoots(this._scanType),
            skipped_folders: this._module.GetExcludePatterns(this._scanType)
        } as AnalyzeScanRequest;
        super.logStartScanning(request);
        let response: IacScanResponse = await this.executeRequest(this._progressManager.checkCancel, request).then(runResult =>
            this.convertResponse(runResult)
        );
        if (response) {
            this._scanResults.iacScan = response;
            this._scanResults.iacScanTimestamp = Date.now();
            let issuesCount: number = AnalyzerUtils.populateIacIssues(this._root, this._scanResults);
            super.logNumberOfIssues(issuesCount, this._scanResults.path, startTime, this._scanResults.iacScanTimestamp);
            this._root.apply();
        }
        this._progressManager.reportProgress();
    }

    /**
     * Generate response from the run results
     * @param response - Run results generated from the binary
     * @returns the response generated from the scan run
     */
    public convertResponse(response?: AnalyzerScanResponse): IacScanResponse {
        if (!response) {
            return {} as IacScanResponse;
        }
        let analyzerScanRun: AnalyzerScanRun = response.runs[0];
        let iacResponse: IacScanResponse = {
            filesWithIssues: []
        } as IacScanResponse;

        // Get the full descriptions of all rules
        let rulesFullDescription: Map<string, string> = new Map<string, string>();
        for (const rule of analyzerScanRun.tool.driver.rules) {
            if (rule.fullDescription) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
        }
        // Generate response data
        analyzerScanRun.results?.forEach(analyzeIssue =>
            AnalyzerUtils.generateIssueData(iacResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId))
        );

        return iacResponse;
    }
}
