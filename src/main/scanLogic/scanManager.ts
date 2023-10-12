import * as vscode from 'vscode';

import { ExtensionComponent } from '../extensionComponent';

import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils, EntitlementScanFeature } from '../connect/connectionUtils';
import { LogManager } from '../log/logManager';

import { IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { StepProgress } from '../treeDataProviders/utils/stepProgress';
import { Resource } from '../utils/resource';
import { ScanUtils } from '../utils/scanUtils';
import { Utils } from '../utils/utils';
import { GraphScanLogic } from './scanGraphLogic';
import { JasRunner } from './scanRunners/jasRunner';

export interface EntitledScans {
    dependencies: boolean;
    applicability: boolean;
    sast: boolean;
    iac: boolean;
    secrets: boolean;
}

/**
 * Manage all the Xray scans
 */
export class ScanManager implements ExtensionComponent {
    // every day
    private static readonly RESOURCE_CHECK_UPDATE_INTERVAL_MILLISECS: number = 1000 * 60 * 60 * 24;

    private static lastOutdatedCheck: number;
    private _entitledScans: EntitledScans = {} as EntitledScans;

    constructor(private _connectionManager: ConnectionManager, protected _logManager: LogManager) {}

    activate() {
        Utils.createDirIfNotExists(ScanUtils.getIssuesPath());
        return this;
    }

    public get logManager(): LogManager {
        return this._logManager;
    }

    public get connectionManager(): ConnectionManager {
        return this._connectionManager;
    }

    public get entitledScans(): EntitledScans {
        return this._entitledScans;
    }

    /**
     * Updates all the resources that are outdated.
     * @param supportedScans - the supported scan to get the needed resources. if default, should call getSupportedScans before calling this method.
     * @returns true if all the outdated resources updated successfully, false otherwise
     */
    public async updateResources(supportedScans: EntitledScans = this._entitledScans): Promise<boolean> {
        let result: boolean = true;
        await ScanUtils.backgroundTask(async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            progress.report({ message: 'Checking for updates' });
            let resources: Resource[] = await this.getOutdatedResources(supportedScans);
            if (resources.length === 0) {
                return;
            }
            let progressManager: StepProgress = new StepProgress(progress);
            progressManager.startStep('Updating extension', resources.length);
            this._logManager.logMessage(
                'Updating outdated resources (' + resources.length + '): ' + resources.map(resource => resource.name).join(),
                'DEBUG'
            );
            let updatePromises: Promise<any>[] = [];
            resources.forEach(async (resource: Resource) =>
                updatePromises.push(
                    resource
                        .update()
                        .catch(err => {
                            this._logManager.logError(<Error>err);
                            result = false;
                        })
                        .finally(() => progressManager.reportProgress())
                )
            );
            await Promise.all(updatePromises);
            this._logManager.logMessage('Updating extension finished ' + (result ? 'successfully' : 'with errors'), result ? 'INFO' : 'ERR');
        });

        return result;
    }

    private async getOutdatedResources(supportedScans: EntitledScans): Promise<Resource[]> {
        if (!this.shouldCheckOutdated()) {
            return [];
        }
        this._logManager.logMessage('Checking for updates', 'INFO');
        ScanManager.lastOutdatedCheck = Date.now();
        let promises: Promise<boolean>[] = [];
        let outdatedResources: Resource[] = [];
        for (const resource of this.getResources(supportedScans)) {
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

    private shouldCheckOutdated(): boolean {
        return !ScanManager.lastOutdatedCheck || Date.now() - ScanManager.lastOutdatedCheck > ScanManager.RESOURCE_CHECK_UPDATE_INTERVAL_MILLISECS;
    }

    private getResources(supportedScans: EntitledScans): Resource[] {
        let resources: Resource[] = [];
        if (supportedScans.applicability || supportedScans.iac || supportedScans.secrets) {
            resources.push(JasRunner.getAnalyzerManagerResource(this._logManager));
        } else {
            this.logManager.logMessage('You are not entitled to run Advanced Security scans', 'DEBUG');
        }
        return resources;
    }

    /**
     * Check if Contextual Analysis (Applicability) is supported for the user
     */
    public async isApplicabilitySupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Applicability);
    }

    /**
     * Check if Infrastructure As Code (Iac) is supported for the user
     */
    public async isIacSupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Iac);
    }

    /**
     * Check if Secrets scan is supported for the user
     */
    public async isSecretsSupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Secrets);
    }

    /**
     * Check if SAST scan is supported for the user
     */
    public async isSastSupported(): Promise<boolean> {
        // TODO: change to SAST feature when Xray entitlement service support it.
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Applicability);
    }

    /**
     * Get all the entitlement status for each type of scan the manager offers
     */
    public async getSupportedScans(): Promise<EntitledScans> {
        let supportedScans: EntitledScans = {} as EntitledScans;
        let requests: Promise<any>[] = [];
        requests.push(
            this.isApplicabilitySupported()
                .then(res => (supportedScans.applicability = res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        requests.push(
            this.isIacSupported()
                .then(res => (supportedScans.iac = res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        requests.push(
            this.isSecretsSupported()
                .then(res => (supportedScans.secrets = res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        requests.push(
            this.isSastSupported()
                .then(res => (supportedScans.sast = res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        await Promise.all(requests);
        this._entitledScans = supportedScans;
        return supportedScans;
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
        return await scanLogic.scan(graphRoot, progress, checkCanceled);
    }
}
