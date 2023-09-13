import * as vscode from 'vscode';

import { ExtensionComponent } from '../extensionComponent';

import { LogManager } from '../log/logManager';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils, EntitlementScanFeature } from '../connect/connectionUtils';

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
import { Utils } from '../utils/utils';
import { IacRunner, IacScanResponse } from './scanRunners/iacScan';
import { SecretsRunner, SecretsScanResponse } from './scanRunners/secretsScan';

export interface SupportedScans {
    dependencies: boolean;
    applicability: boolean;
    eos: boolean;
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
    private _supportedScans: SupportedScans = {} as SupportedScans;

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

    public get supportedScans(): SupportedScans {
        return this._supportedScans;
    }

    /**
     * Updates all the resources that are outdated.
     * @param supportedScans - the supported scan to get the needed resources. if default, should call getSupportedScans before calling this method.
     * @returns true if all the outdated resources updated successfully, false otherwise
     */
    public async updateResources(supportedScans: SupportedScans = this._supportedScans): Promise<boolean> {
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

    private async getOutdatedResources(supportedScans: SupportedScans): Promise<Resource[]> {
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

    private getResources(supportedScans: SupportedScans): Resource[] {
        let resources: Resource[] = [];
        if (supportedScans.applicability || supportedScans.iac || supportedScans.secrets) {
            resources.push(BinaryRunner.getAnalyzerManagerResource(this._logManager));
        } else {
            this.logManager.logMessage('You are not entitled to run Advanced Security scans', 'DEBUG');
        }
        return resources;
    }

    /**
     * Validate if the graph-scan is supported in the Xray version
     */
    public async validateGraphSupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayVersionForScanGraph(this._connectionManager.createJfrogClient(), this._logManager);
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
     * Check if Eos scan is supported for the user
     */
    public async isEosSupported(): Promise<boolean> {
        return true;
    }

    /**
     * Get all the entitlement status for each type of scan the manager offers
     */
    public async getSupportedScans(): Promise<SupportedScans> {
        let supportedScans: SupportedScans = {} as SupportedScans;
        let requests: Promise<any>[] = [];
        requests.push(
            this.validateGraphSupported()
                .then(res => (supportedScans.dependencies = res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
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
            this.isEosSupported()
                .then(res => (supportedScans.eos = res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        await Promise.all(requests);
        this._supportedScans = supportedScans;
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

    /**
     * Scan CVE in files for applicability issues.
     * @param directory - the directory that will be scan
     * @param checkCancel - check if should cancel
     * @param cveToRun - the CVE list we want to run applicability scan on
     * @returns the applicability scan response
     */
    public async scanApplicability(
        directory: string,
        checkCancel: () => void,
        cveToRun: Set<string> = new Set<string>()
    ): Promise<ApplicabilityScanResponse> {
        let applicableRunner: ApplicabilityRunner = new ApplicabilityRunner(this._connectionManager, this._logManager);
        if (!applicableRunner.validateSupported()) {
            this._logManager.logMessage('Applicability runner could not find binary to run', 'WARN');
            return {} as ApplicabilityScanResponse;
        }
        let skipFiles: string[] = AnalyzerUtils.getAnalyzerManagerExcludePattern(Configuration.getScanExcludePattern());
        this._logManager.logMessage(
            "Scanning directory '" + directory + "' for CVE issues: " + Array.from(cveToRun.values()) + '. Skipping files: ' + skipFiles,
            'DEBUG'
        );
        return await applicableRunner.scan(directory, checkCancel, cveToRun, skipFiles);
    }

    /**
     * Scan directory for 'Infrastructure As Code' (Iac) issues.
     * @param directory - the directory that will be scan
     * @param checkCancel - check if should cancel
     * @returns the Iac scan response
     */
    public async scanIac(directory: string, checkCancel: () => void): Promise<IacScanResponse> {
        let iacRunner: IacRunner = new IacRunner(this._connectionManager, this.logManager);
        if (!iacRunner.validateSupported()) {
            this._logManager.logMessage('Iac runner could not find binary to run', 'WARN');
            return {} as IacScanResponse;
        }
        let skipFiles: string[] = AnalyzerUtils.getAnalyzerManagerExcludePattern(Configuration.getScanExcludePattern());
        this._logManager.logMessage("Scanning directory '" + directory + "', for Iac issues. Skipping files: " + skipFiles, 'DEBUG');
        return await iacRunner.scan(directory, checkCancel, skipFiles);
    }
    /**
     * Scan directory for secrets issues.
     * @param directory - the directory that will be scan
     * @param checkCancel - check if should cancel
     * @returns the Secrets scan response
     */
    public async scanSecrets(directory: string, checkCancel: () => void): Promise<SecretsScanResponse> {
        let secretsRunner: SecretsRunner = new SecretsRunner(this._connectionManager, this.logManager);
        if (!secretsRunner.validateSupported()) {
            this._logManager.logMessage('Secrets runner could not find binary to run', 'WARN');
            return {} as SecretsScanResponse;
        }
        let skipFiles: string[] = AnalyzerUtils.getAnalyzerManagerExcludePattern(Configuration.getScanExcludePattern());
        this._logManager.logMessage("Scanning directory '" + directory + "', for Secrets issues. Skipping files: " + skipFiles, 'DEBUG');
        return await secretsRunner.scan(directory, checkCancel, skipFiles);
    }

    /**
     * Scan for Eos issues.
     * @param checkCancel - check if should cancel
     * @param requests - the Eos requests to run
     * @returns the scan response
     */
    public async scanEos(checkCancel: () => void, runDirectory?: string, ...requests: EosScanRequest[]): Promise<EosScanResponse> {
        let eosRunner: EosRunner = new EosRunner(this._connectionManager, this._logManager, undefined, undefined, runDirectory);
        if (!eosRunner.validateSupported()) {
            this._logManager.logMessage('Eos runner could not find binary to run', 'WARN');
            return {} as EosScanResponse;
        }
        if (requests.length === 0) {
            this._logManager.logMessage('Eos runner must receive at least one request to run', 'ERR');
            return {} as EosScanResponse;
        }
        let skipFiles: string[] = AnalyzerUtils.getAnalyzerManagerExcludePattern(Configuration.getScanExcludePattern());
        this._logManager.logMessage(
            'Scanning for Eos issues in ' +
                requests.map(request => `(Language '${request.language}', roots: [${request.roots.join()}])`) +
                '. Skipping files: ' +
                skipFiles,
            'DEBUG'
        );
        return eosRunner.scan(checkCancel, skipFiles, ...requests);
    }
}
