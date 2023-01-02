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
    private static readonly BINARY_ABORT_CHECK_INVTERVAL: number = 1 * 1000; // every 1 sec

    constructor(private _connectionManager: ConnectionManager, protected _logManager: LogManager) {}

    activate() {
        return this;
    }

    public get logManager(): LogManager {
        return this._logManager;
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
     * Validate if the applicable-scan is supported
     */
    public validateApplicableSupported(): boolean {
        return new ApplicabilityRunner(ScanManager.BINARY_ABORT_CHECK_INVTERVAL, this._logManager).isSupported;
    }

    /**
     * Validate if the eos-scan is supported
     */
    public validateEosSupported(): boolean {
        return new EosRunner(ScanManager.BINARY_ABORT_CHECK_INVTERVAL, this._logManager).isSupported;
    }

    /**
     * Scan dependecy graph async for Xray issues.
     * The graph will be flatten and only distincts dependencies will be sent
     * @param progress - the progress for this scan
     * @param graphRoot - the dependency graph to scan
     * @param checkCanceled - method to check if the action was cancled
     * @param flatten - if true will flatten the graph and send only distincts dependencies, other wise will keep the graph as is
     * @returns the result of the scan
     */
    public async scanDependencyGraph(progress: XrayScanProgress, graphRoot: RootNode, checkCanceled: () => void): Promise<IGraphResponse> {
        let scanLogic: GraphScanLogic = new GraphScanLogic(this._connectionManager);
        return scanLogic.scan(graphRoot, progress, checkCanceled);
    }

    /**
     * Scan CVE in files for applicability issues.
     * @param directory - the directory that will be scan
     * @param abortController - the abort controller for cancele request
     * @param cveToRun - the CVE list we want to run applicability scan on
     * @param skipFolders - the folders inside directory we want to skip scanning
     * @returns the applicability scan response
     */
    public async scanApplicability(
        directory: string,
        abortController: AbortController,
        cveToRun: string[] = [],
        skipFolders: string[] = []
    ): Promise<ApplicabilityScanResponse> {
        let applicableRunner: ApplicabilityRunner = new ApplicabilityRunner(ScanManager.BINARY_ABORT_CHECK_INVTERVAL, this._logManager);
        if (!applicableRunner.isSupported) {
            this._logManager.logMessage('Applicability scan is not supported', 'DEBUG');
            return {} as ApplicabilityScanResponse;
        }
        return applicableRunner.scan(directory, abortController, cveToRun, skipFolders);
    }

    public async scanEos(abortController: AbortController, ...requests: EosScanRequest[]): Promise<EosScanResponse> {
        let eosRunner: EosRunner = new EosRunner(ScanManager.BINARY_ABORT_CHECK_INVTERVAL, this._logManager);
        if (!eosRunner.isSupported) {
            this._logManager.logMessage('Eos scan is not supported', 'DEBUG');
            return {} as EosScanResponse;
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
        return eosRunner.scan(abortController, ...eosRequests);
    }
}
