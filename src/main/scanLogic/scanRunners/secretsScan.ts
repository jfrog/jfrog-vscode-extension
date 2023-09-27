import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { AnalyzerUtils, FileWithSecurityIssues } from '../../treeDataProviders/utils/analyzerUtils';
import { Module } from '../../types/jfrogAppsConfig';
import { AppsConfigUtils } from '../../utils/appConfigUtils';
import { Resource } from '../../utils/resource';
import { ScanUtils } from '../../utils/scanUtils';
import { AnalyzeScanRequest, AnalyzerScanResponse, ScanType } from './analyzerModels';
import { BinaryRunner } from './binaryRunner';

export interface SecretsScanResponse {
    filesWithIssues: FileWithSecurityIssues[];
}

/**
 * Describes a runner for the Secrets scan executable file.
 */
export class SecretsRunner extends BinaryRunner {
    constructor(
        connectionManager: ConnectionManager,
        logManager: LogManager,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.Secrets, logManager, binary);
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string | undefined, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['sec', yamlConfigPath], executionLogDirectory);
    }

    /**
     * Scan for secrets
     * @param module - the module that will be scanned
     * @param checkCancel - check if cancel
     * @returns the response generated from the scan
     */
    public async scan(module: Module, checkCancel: () => void): Promise<SecretsScanResponse> {
        let request: AnalyzeScanRequest = {
            type: ScanType.Secrets,
            roots: AppsConfigUtils.GetSourceRoots(module, module.scanners?.secrets),
            skipped_folders: AppsConfigUtils.GetExcludePatterns(module, module.scanners?.secrets)
        } as AnalyzeScanRequest;
        this._logManager.logMessage(
            "Scanning directories '" + request.roots + "', for secrets. Skipping folders: " + request.skipped_folders,
            'DEBUG'
        );
        return await this.run(checkCancel, request).then(runResult => this.convertResponse(runResult));
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
