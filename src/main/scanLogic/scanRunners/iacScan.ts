import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { IssuesRootTreeNode } from '../../treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils, FileWithSecurityIssues } from '../../treeDataProviders/utils/analyzerUtils';
import { StepProgress } from '../../treeDataProviders/utils/stepProgress';
import { ScanResults } from '../../types/workspaceIssuesDetails';
import { AppsConfigModule } from '../../utils/jfrogAppsConfig/jfrogAppsConfig';
import { AnalyzerManager } from './analyzerManager';
import { AnalyzeIssue, AnalyzeScanRequest, AnalyzerScanResponse, AnalyzerScanRun, ScanType } from './analyzerModels';
import { BinaryEnvParams, JasRunner, RunArgs } from './jasRunner';

export interface IacScanResponse {
    filesWithIssues: FileWithSecurityIssues[];
    ignoreCount?: number;
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
        config: AppsConfigModule,
        analyzerManager: AnalyzerManager
    ) {
        super(connectionManager, ScanType.Iac, logManager, config, analyzerManager);
    }

    /** @override */
    protected async runBinary(checkCancel: () => void, args: RunArgs, params?: BinaryEnvParams): Promise<void> {
        await this.runAnalyzerManager(checkCancel, ['iac', args.request.requestPath], this._analyzerManager.createEnvForRun(params));
    }

    /**
     * Run IaC scan async task and populate the given bundle with the results.
     */
    public async scan(params?: BinaryEnvParams): Promise<void> {
        let startTime: number = Date.now();
        let request: AnalyzeScanRequest = {
            type: this._scanType,
            roots: this._config.GetSourceRoots(this._scanType),
            skipped_folders: this._config.GetExcludePatterns(this._scanType)
        } as AnalyzeScanRequest;
        super.logStartScanning(request, params?.msi);
        let response: AnalyzerScanResponse | undefined = await this.executeRequest(this._progressManager.checkCancel, request, params);
        let iacScanResponse: IacScanResponse = this.generateScanResponse(response);
        if (response) {
            this._scanResults.iacScan = iacScanResponse;
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
    public generateScanResponse(response?: AnalyzerScanResponse): IacScanResponse {
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
        let ignoreCount: number = 0;
        analyzerScanRun.results?.forEach((analyzeIssue: AnalyzeIssue) => {
            if (analyzeIssue.suppressions && analyzeIssue.suppressions.length > 0) {
                // Suppress issue
                ignoreCount++;
                return;
            }
            AnalyzerUtils.generateIssueData(iacResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId));
        });
        iacResponse.ignoreCount = ignoreCount;

        return iacResponse;
    }
}
