import * as path from 'path';
import * as os from 'os';

import { ConnectionManager } from "../../connect/connectionManager";
import { LogManager } from "../../log/logManager";
import { ScanUtils } from "../../utils/scanUtils";
import { AnalyzerScanResponse, AnalyzeScanRequest } from "./analyzerModels";
import { BinaryRunner } from "./binaryRunner";

export interface TerraformScanResponse {
    filesWithIssues: EosFileIssues[];
}

export class TerraformRunner extends BinaryRunner {
    private static readonly BINARY_FOLDER: string = 'terraform';
    private static readonly BINARY_NAME: string = 'tf_scanner';

    constructor(connectionManager: ConnectionManager, abortCheckInterval: number, logManager: LogManager) {
        super(
            connectionManager,
            abortCheckInterval,
            logManager,
            path.join(ScanUtils.getHomePath(), TerraformRunner.BINARY_FOLDER, TerraformRunner.getBinaryName())
        );
    }

    protected validateSupported(): boolean {
        if (os.platform() !== 'linux' && os.platform() !== 'darwin' && os.platform() !== 'win32') {
            this._logManager.logMessage("Eos scan is not supported on '" + os.platform() + "' os", 'DEBUG');
            return false;
        }
        return super.validateSupported();
    }

    /** @override */
    protected static getBinaryName(): string {
        let name: string = TerraformRunner.BINARY_NAME;
        switch (os.platform()) {
            case 'linux':
                return name + '_ubuntu';
            case 'darwin':
                return name + '_macos';
            case 'win32':
                return name + '.exe';
        }
        return name;
    }

    /** @override */
    public async runBinary(abortSignal: AbortSignal, yamlConfigPath: string): Promise<void> {
        await this.executeBinary(abortSignal, ['scan', yamlConfigPath]);
    }

    /**
     * Scan for Terraform issues
     * @param abortController - the controller that signals abort for the operation
     * @param requests - requests to run
     * @returns the response generated from the scan
     */
    public async scan(abortController: AbortController, directory: string): Promise<TerraformScanResponse> {
        let request: AnalyzeScanRequest = {
            type: 'iac-scan-modules',
            roots: [directory]
        } as AnalyzeScanRequest;
        return await this.run(abortController, true, request).then(runResult => this.generateScanResponse(runResult));
    }


    generateScanResponse(runResult: AnalyzerScanResponse | undefined): any {
        throw new Error('Method not implemented.');
    }
}