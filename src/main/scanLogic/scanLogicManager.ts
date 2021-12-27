import { ComponentDetails } from 'jfrog-client-js';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils } from '../connect/connectionUtils';
import { ExtensionComponent } from '../extensionComponent';
import { LogManager } from '../log/logManager';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { AbstractScanLogic } from './abstractScanLogic';
import { ComponentSummaryScanLogic } from './componentSummaryScanLogic';
import { GraphScanLogic } from './graphScanLogic';

/**
 * Provides the scan logic type - "summary/component" or "scan/graph" according to the Xray version.
 */
export class ScanLogicManager implements ExtensionComponent {
    constructor(protected _connectionManager: ConnectionManager, protected _scanCacheManager: ScanCacheManager, protected _logManager: LogManager) {}

    activate() {
        return this;
    }

    public async scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Set<ComponentDetails>,
        checkCanceled: () => void
    ) {
        const totalComponents: number = componentsToScan.size();
        if (totalComponents === 0) {
            return;
        }
        let scanGraphSupported: boolean = await ConnectionUtils.testXrayVersionForScanGraph(
            this._connectionManager.createJfrogClient(),
            this._logManager
        );
        let scanLogic: AbstractScanLogic = scanGraphSupported
            ? new GraphScanLogic(this._connectionManager, this._scanCacheManager)
            : new ComponentSummaryScanLogic(this._connectionManager, this._scanCacheManager);
        await scanLogic.scanAndCache(progress, componentsToScan, checkCanceled);
    }
}
