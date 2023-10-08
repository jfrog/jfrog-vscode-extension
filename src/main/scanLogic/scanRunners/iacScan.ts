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

export interface IacScanResponse {
    filesWithIssues: FileWithSecurityIssues[];
}

/**
 * Describes a runner for the 'Infrastructure As Code' (Iac) scan executable file.
 */
export class IacRunner extends JasScanner {
    constructor(
        connectionManager: ConnectionManager,
        logManager: LogManager,
        module: Module,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.Iac, logManager, module, binary);
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string | undefined, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['iac', yamlConfigPath], executionLogDirectory);
    }

    public async scan(scanResults: ScanResults, root: IssuesRootTreeNode, scanManager: ScanManager, progressManager: StepProgress): Promise<void> {
        let startIacTime: number = Date.now();
        let request: AnalyzeScanRequest = {
            type: ScanType.Iac,
            roots: AppsConfigUtils.GetSourceRoots(this._module, this._module.scanners?.iac),
            skipped_folders: AppsConfigUtils.GetExcludePatterns(this._module, this._module.scanners?.iac)
        } as AnalyzeScanRequest;
        this._logManager.logMessage(
            "Scanning directories '" + request.roots + "', for Iac issues. Skipping folders: " + request.skipped_folders,
            'DEBUG'
        );
        let response: IacScanResponse = await this.run(progressManager.checkCancel, request).then(runResult => this.convertResponse(runResult));
        if (response) {
            scanResults.iacScan = response;
            scanResults.iacScanTimestamp = Date.now();
            let issuesCount: number = AnalyzerUtils.populateIacIssues(root, scanResults);
            scanManager.logManager.logMessage(
                'Found ' +
                    issuesCount +
                    " Iac issues in workspace = '" +
                    scanResults.path +
                    "' (elapsed " +
                    (scanResults.iacScanTimestamp - startIacTime) / 1000 +
                    ' seconds)',
                'INFO'
            );
            root.apply();
        }
        progressManager.reportProgress();
    }

    /**
     * Generate response from the run results
     * @param analyzerScanResponse - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public convertResponse(analyzerScanResponse?: AnalyzerScanResponse): IacScanResponse {
        if (!analyzerScanResponse) {
            return {} as IacScanResponse;
        }
        let iacResponse: IacScanResponse = {
            filesWithIssues: []
        } as IacScanResponse;

        for (const run of analyzerScanResponse.runs) {
            // Get the full descriptions of all rules
            let rulesFullDescription: Map<string, string> = new Map<string, string>();
            for (const rule of run.tool.driver.rules) {
                if (rule.fullDescription) {
                    rulesFullDescription.set(rule.id, rule.fullDescription.text);
                }
            }
            // Generate response data
            run.results?.forEach(analyzeIssue =>
                AnalyzerUtils.generateIssueData(iacResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId))
            );
        }
        return iacResponse;
    }
}
