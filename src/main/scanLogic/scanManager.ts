import * as vscode from 'vscode';

import { ExtensionComponent } from '../extensionComponent';

import { LogManager } from '../log/logManager';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils } from '../connect/connectionUtils';

import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { GraphScanLogic } from './scanGraphLogic';
import { ApplicabilityRunner, ApplicabilityScanResponse } from './scanRunners/applicabilityScan';
import { EosRunner, EosScanRequest, EosScanResponse } from './scanRunners/eosScan';
import { AnalyzerUtils } from '../treeDataProviders/utils/analyzerUtils';
import { Configuration } from '../utils/configuration';
import { Resource } from '../utils/resource';
import { BinaryRunner } from './scanRunners/binaryRunner';
import { ScanUtils } from '../utils/scanUtils';
import { StepProgress } from '../treeDataProviders/utils/stepProgress';

/**
 * Manage all the Xray scans
 */
export class ScanManager implements ExtensionComponent {
    private static readonly BINARY_ABORT_CHECK_INTERVAL: number = 1000; // every 1 sec
    private static readonly RESOURCE_CHECK_UPDATE_INTERVAL: number = 1000 * 60 * 60 * 24; // every day

    private static lastOutdatedTimestamp: number;

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
     * Updates all the resources that are outdated
     * @returns true if all the outdated resources updated successfully, false otherwise
     */
    public async updateResources(): Promise<boolean> {
        let resources: Resource[] = await this.getOutdatedResources();
        if (resources.length === 0) {
            // Noting to do
            return true;
        }
        this._logManager.logMessage(
            'Updating outdated resources (' + resources.length + '): ' + resources.map(resource => resource.name).join(),
            'INFO'
        );
        let updatePromises: Promise<boolean>[] = [];
        let results: boolean[] = [];
        // Update
        await ScanUtils.backgroundTask(async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            let progressManager: StepProgress = new StepProgress(progress);
            progressManager.startStep('Update outdated resources', resources.length);
            resources.forEach(async resource =>
                updatePromises.push(
                    resource
                        .update()
                        .catch(err => {
                            this._logManager.logError(<Error>err);
                            return false;
                        })
                        .finally(() => progressManager.reportProgress())
                )
            );
            results = await Promise.all(updatePromises);
        });
        let result: boolean = results.reduce((accumulator, currentValue) => accumulator && currentValue, true);
        this._logManager.logMessage(
            'Updating outdated extension resources finished ' + (result ? 'successfully' : 'with error'),
            result ? 'INFO' : 'ERR'
        );
        return result;
    }

    private async getOutdatedResources(): Promise<Resource[]> {
        if (this.shouldCheckOutdated()) {
            ScanManager.lastOutdatedTimestamp = Date.now();
            let promises: Promise<boolean>[] = [];
            let outdatedResources: Resource[] = [];
            for (const resource of this.getResources()) {
                promises.push(
                    resource
                        .isOutdated()
                        .then(outdated => {
                            if (outdated) {
                                outdatedResources.push(resource);
                            }
                            return outdated;
                        })
                        .catch(err => {
                            this._logManager.logError(<Error>err);
                            return false;
                        })
                );
            }
            await Promise.all(promises);
            return outdatedResources;
        }
        return [];
    }

    private shouldCheckOutdated(): boolean {
        let now: number = Date.now();
        return !ScanManager.lastOutdatedTimestamp || now - ScanManager.lastOutdatedTimestamp > ScanManager.RESOURCE_CHECK_UPDATE_INTERVAL;
    }

    private getResources(): Resource[] {
        return [BinaryRunner.getAnalyzerManagerResource(this._logManager)];
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
        return new ApplicabilityRunner(this._connectionManager, ScanManager.BINARY_ABORT_CHECK_INTERVAL, this._logManager).validateSupported();
    }

    /**
     * Validate if the eos-scan is supported
     */
    public validateEosSupported(): boolean {
        return new EosRunner(this._connectionManager, ScanManager.BINARY_ABORT_CHECK_INTERVAL, this._logManager).validateSupported();
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
        if (!applicableRunner.validateSupported()) {
            this._logManager.logMessage('Applicability scan is not supported', 'DEBUG');
            return {} as ApplicabilityScanResponse;
        }
        let skipFiles: string[] = AnalyzerUtils.getApplicableExcludePattern(Configuration.getScanExcludePattern());
        this._logManager.logMessage('Scanning directory ' + directory + ', for CVE issues: ' + cveToRun + ', skipping files: ' + skipFiles, 'DEBUG');
        return applicableRunner.scan(directory, abortController, cveToRun, skipFiles);
    }

    public async scanEos(abortController: AbortController, ...requests: EosScanRequest[]): Promise<EosScanResponse> {
        let eosRunner: EosRunner = new EosRunner(this._connectionManager, ScanManager.BINARY_ABORT_CHECK_INTERVAL, this._logManager);
        if (!eosRunner.validateSupported()) {
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
