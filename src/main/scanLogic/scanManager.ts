import { ExtensionComponent } from '../extensionComponent';

import { LogManager } from '../log/logManager';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils } from '../connect/connectionUtils';

import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { GraphScanLogic } from './scanGraphLogic';
import { ApplicabilityRunner, ApplicabilityScanResponse } from './scanRunners/applicabilityScan';
import { EosRunner, EosScanRequest, EosScanResponse } from './scanRunners/eosScan';

/**
 * Manage all the Xray scans
 */
export class ScanManager implements ExtensionComponent {
    constructor(private _connectionManager: ConnectionManager, protected _logManager: LogManager) {}

    activate() {
        return this;
    }

    public get connectionManager(): ConnectionManager {
        return this._connectionManager;
    }

    /**
     * Validate if the graph-scan is supported in the Xray version
     */
    public async validateGraphSupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayVersionForScanGraph(this._connectionManager.createJfrogClient(), this._logManager);
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
        let scanLogic: GraphScanLogic = new GraphScanLogic(this._connectionManager);
        return scanLogic.scan(graphRoot, flatten, progress, checkCanceled);
    }

    public async scanApplicability(
        directory: string,
        cveToRun: string[] = [],
        skipFolders: string[] = []
    ): Promise<ApplicabilityScanResponse | undefined> {
        let applicableRunner: ApplicabilityRunner = new ApplicabilityRunner(this._logManager);
        if (!applicableRunner.isSupported) {
            return undefined;
        }
        this._logManager.logMessage("Starting Applicable scan: directory = '" + directory + "'", 'DEBUG');
        return applicableRunner.scan(directory, cveToRun, skipFolders);
    }

    public async scanEos(...requests: EosScanRequest[]): Promise<EosScanResponse | undefined> {
        let eosRunner: EosRunner = new EosRunner(this._logManager);
        if (!eosRunner.isSupported) {
            return undefined;
        }
        let eosRequests: EosScanRequest[] = [];
        for (const request of requests) {
            if (request.roots.length > 0) {
                eosRequests.push({
                    language: request.language,
                    roots: request.roots
                } as EosScanRequest);
            }
        }
        this._logManager.logMessage('Starting Eos scan', 'DEBUG');
        return eosRunner.scan(...eosRequests);
    }
}
