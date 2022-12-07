import { ExtensionComponent } from '../extensionComponent';

import { LogManager } from '../log/logManager';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils } from '../connect/connectionUtils';

import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { GraphScanLogic } from './scanGraphLogic';

export class ScanManager implements ExtensionComponent {
    constructor(protected _connectionManager: ConnectionManager, protected _logManager: LogManager) {}

    activate() {
        return this;
    }

    public async scanDependencyGraph(progress: XrayScanProgress, projectRoot: RootNode, checkCanceled: () => void): Promise<IGraphResponse> {
        let scanGraphSupported: boolean = await ConnectionUtils.testXrayVersionForScanGraph(
            this._connectionManager.createJfrogClient(),
            this._logManager
        );
        if (!scanGraphSupported) {
            // TODO: show warning for deprecated
            this._logManager.logError(new Error('scan with graph is not supported'), true);
            return {} as IGraphResponse;
        }
        let scanLogic: GraphScanLogic = new GraphScanLogic(this._connectionManager);
        return scanLogic.scan(projectRoot, progress, checkCanceled);
    }
}
