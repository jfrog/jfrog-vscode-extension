import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { AnalyzeScanRequest, AnalyzerType } from './analyzerModels';
import { BinaryRunner } from './binaryRunner';

export class IacRunner extends BinaryRunner {
    constructor(connectionManager: ConnectionManager, abortCheckInterval: number, logManager: LogManager) {
        super(connectionManager, abortCheckInterval, AnalyzerType.Iac, logManager);
    }

    /** @override */
    public async runBinary(checkCancel: () => void, yamlConfigPath: string, executionLogDirectory: string): Promise<void> {
        await this.executeBinary(checkCancel, ['iac', yamlConfigPath], executionLogDirectory);
    }

    public async scan(directory: string, checkCancel: () => void): Promise<TerraformScanResponse> {
        let request: AnalyzeScanRequest = {
            type: AnalyzerType.Iac,
            roots: [directory]
        } as AnalyzeScanRequest;
        return await this.run(checkCancel, request).then(runResult => this.generateScanResponse(runResult));
    }
}
