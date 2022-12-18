import { ExtensionComponent } from '../extensionComponent';

import { LogManager } from '../log/logManager';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils } from '../connect/connectionUtils';

import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { GraphScanLogic } from './scanGraphLogic';

/**
 * Manage all the Xray scans
 */
export class ScanManager implements ExtensionComponent {
    constructor(protected _connectionManager: ConnectionManager, protected _logManager: LogManager) {}

    activate() {
        return this;
    }

    /**
     * Validate if the graph-scan is supported in the Xray version
     */
    private async validateGraphSupported(): Promise<boolean> {
        let scanGraphSupported: boolean = await ConnectionUtils.testXrayVersionForScanGraph(
            this._connectionManager.createJfrogClient(),
            this._logManager
        );
        if (!scanGraphSupported) {
            this._logManager.logError(new Error('scan with graph is not supported'), true);
        }
        return scanGraphSupported;
    }

    /**
     * Scan dependecy graph async for Xray issues.
     * @param progress - the progress for this scan
     * @param graphRoot - the dependency graph to scan
     * @param checkCanceled - method to check if the action was cancled
     * @param flatten - if true will flatten the graph and send only distincts dependencies, other wise will keep the graph as is
     * @returns the result of the scan
     */
    public async scanDependencyGraph(
        progress: XrayScanProgress,
        graphRoot: RootNode,
        checkCanceled: () => void,
        flatten: boolean = true
    ): Promise<IGraphResponse> {
        let supported: boolean = await this.validateGraphSupported();
        if (!supported) {
            return {} as IGraphResponse;
        }
        let scanLogic: GraphScanLogic = new GraphScanLogic(this._connectionManager);
        return scanLogic.scan(graphRoot, flatten, progress, checkCanceled);
    }
}
