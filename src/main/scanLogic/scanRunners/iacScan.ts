import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { AnalyzerUtils, FileWithSecurityIssues } from '../../treeDataProviders/utils/analyzerUtils';
import { Resource } from '../../utils/resource';
import { ScanUtils } from '../../utils/scanUtils';
import { AnalyzeScanRequest, AnalyzerScanResponse, ScanType } from './analyzerModels';
import { BinaryRunner } from './binaryRunner';

export interface IacScanResponse {
    filesWithIssues: FileWithSecurityIssues[];
}

/**
 * Describes a runner for the 'Infrastructure As Code' (Iac) scan executable file.
 */
export class IacRunner extends BinaryRunner {
    constructor(
        connectionManager: ConnectionManager,
        logManager: LogManager,
        binary?: Resource,
        timeout: number = ScanUtils.ANALYZER_TIMEOUT_MILLISECS
    ) {
        super(connectionManager, timeout, ScanType.Iac, logManager, binary);
    }

    /** @override */
    protected async runBinary(yamlConfigPath: string, executionLogDirectory: string, checkCancel: () => void): Promise<void> {
        await this.executeBinary(checkCancel, ['iac', yamlConfigPath], executionLogDirectory);
    }

    public async scan(directory: string, checkCancel: () => void): Promise<IacScanResponse> {
        let request: AnalyzeScanRequest = {
            type: ScanType.Iac,
            roots: [directory]
        } as AnalyzeScanRequest;
        return await this.run(checkCancel, request).then(runResult => this.convertResponse(runResult));
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
