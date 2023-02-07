import { ExtensionComponent } from '../extensionComponent';

import { LogManager } from '../log/logManager';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils } from '../connect/connectionUtils';

import { RootNode } from '../dependencyTree/dependenciesRoot/rootTree';
import { IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { GraphScanLogic } from './scanGraphLogic';
import { ApplicabilityRunner, ApplicabilityScanResponse } from './scanRunners/applicabilityScan';
import { EosRunner, EosScanRequest, EosScanResponse } from './scanRunners/eosScan';
import { AnalyzerUtils } from '../treeDataProviders/utils/issues/analyzerUtils';
import { Configuration } from '../utils/configuration';

/**
 * Manage all the Xray scans
 */
export class ScanManager implements ExtensionComponent {
    private static readonly BINARY_ABORT_CHECK_INTERVAL: number = 1 * 1000; // every 1 sec

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
        return new ApplicabilityRunner(this._connectionManager, ScanManager.BINARY_ABORT_CHECK_INTERVAL, this._logManager).isSupported;
    }

    /**
     * Validate if the eos-scan is supported
     */
    public validateEosSupported(): boolean {
        return new EosRunner(this._connectionManager, ScanManager.BINARY_ABORT_CHECK_INTERVAL, this._logManager).isSupported;
    }

    /**
     * Scan dependency graph async for Xray issues.
     * The graph will be flatten and only distinct dependencies will be sent
     * @param progress - the progress for this scan
     * @param graphRoot - the dependency graph to scan
     * @param checkCanceled - method to check if the action was canceled
     * @param flatten - if true will flatten the graph and send only distinct dependencies, other wise will keep the graph as is
     * @returns the result of the scan
     */
    public async scanDependencyGraph(progress: XrayScanProgress, graphRoot: RootNode, checkCanceled: () => void): Promise<IGraphResponse> {
        let scanLogic: GraphScanLogic = new GraphScanLogic(this._connectionManager);
        return scanLogic.scan(graphRoot, progress, checkCanceled);
    }

    /**
     * Scan CVE in files for applicability issues.
     * @param directory - the directory that will be scan
     * @param abortController - the abort controller for cancel request
     * @param cveToRun - the CVE list we want to run applicability scan on
     * @returns the applicability scan response
     */
    public async scanApplicability(directory: string, abortController: AbortController, cveToRun: string[] = []): Promise<ApplicabilityScanResponse> {
        let applicableRunner: ApplicabilityRunner = new ApplicabilityRunner(
            this._connectionManager,
            ScanManager.BINARY_ABORT_CHECK_INTERVAL,
            this._logManager
        );
        if (!applicableRunner.isSupported) {
            this._logManager.logMessage('Applicability scan is not supported', 'DEBUG');
            return {} as ApplicabilityScanResponse;
        }
        let skipFiles: string[] = AnalyzerUtils.getApplicableExcludePattern(Configuration.getScanExcludePattern());
        this._logManager.logMessage('Scanning directory ' + directory + ', for CVE issues: ' + cveToRun + ', skipping files: ' + skipFiles, 'DEBUG');
        return applicableRunner.scan(directory, abortController, cveToRun, skipFiles);
    }

    public async scanEos(abortController: AbortController, ...requests: EosScanRequest[]): Promise<EosScanResponse> {
        let eosRunner: EosRunner = new EosRunner(this._connectionManager, ScanManager.BINARY_ABORT_CHECK_INTERVAL, this._logManager);
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
        this._logManager.logMessage('Scanning for Eos issues, roots: ' + eosRequests.map(request => request.roots.join()).join(), 'DEBUG');
        return eosRunner.scan(abortController, ...eosRequests);
    }
}
