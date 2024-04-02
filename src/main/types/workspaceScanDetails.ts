import * as os from 'os';
import { JfrogClient, ScanEvent, ScanEventStatus, StartScanRequest } from 'jfrog-client-js';
import { ScanResults } from './workspaceIssuesDetails';
import { ConnectionManager } from '../connect/connectionManager';
import { Utils } from '../utils/utils';
import { JFrogAppsConfig } from '../utils/jfrogAppsConfig/jfrogAppsConfig';
import { JasRunnerFactory } from '../scanLogic/sourceCodeScan/jasRunnerFactory';
import { ScanManager } from '../scanLogic/scanManager';
import { LogManager } from '../log/logManager';
import { IssuesRootTreeNode } from '../treeDataProviders/issuesTree/issuesRootTreeNode';
import { StepProgress } from '../treeDataProviders/utils/stepProgress';
import { SupportedScans } from '../scanLogic/sourceCodeScan/supportedScans';

export class WorkspaceScanDetails {
    private _connectionManager: ConnectionManager;
    private _logManager: LogManager;

    private _jasRunnerFactory: JasRunnerFactory;

    private _startTime: number = Date.now();
    private _scanEventPromise?: Promise<ScanEvent>;

    private _multiScanId?: string;

    constructor(
        manager: ScanManager,
        supportedScans: SupportedScans,
        private _resultsData: ScanResults,
        private _resultsViewRoot: IssuesRootTreeNode,
        private _scanProgressManager: StepProgress
    ) {
        this._connectionManager = manager.connectionManager;
        this._logManager = manager.logManager;

        this._jasRunnerFactory = new JasRunnerFactory(
            this._connectionManager,
            this._logManager,
            this._resultsData,
            this._resultsViewRoot,
            this._scanProgressManager,
            supportedScans
        );
    }

    public async startScan(): Promise<void> {
        if (!this._connectionManager.shouldReportAnalytics()) {
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        let packageJson: any = require('../../../package.json');
        let request: StartScanRequest = {
            product: packageJson.name,
            product_version: packageJson.version,
            jfrog_user: this._connectionManager.username,
            os_platform: Utils.getPlatform(),
            os_architecture: Utils.getArchitecture(),
            machine_id: JfrogClient.getClientId(Object.values(os.networkInterfaces())),
            analyzer_manager_version: await this._jasRunnerFactory.analyzerManager?.version(),
            jpd_version: this._connectionManager.artifactoryVersion,
            is_default_config: !JFrogAppsConfig.isConfigFileExist(this.results.path)
        };
        this._scanEventPromise = this._connectionManager.startScan(request);
    }

    public async endScan(endStatus: ScanEventStatus): Promise<void> {
        let msi: string | undefined = await this.getMultiScanId();
        if (!msi) {
            // Analytics are disabled
            return;
        }
        let scanEvent: ScanEvent = {
            multi_scan_id: msi,
            total_scan_duration: `${Date.now() - this._startTime}`,
            event_status: endStatus,
            total_findings: this.results.cveDiscovered,
            total_ignored_findings: this.results.ignoreIssueCount
        };
        this._logManager.logMessage(
            `'${this.viewRoot.workspace.uri}' Scan event result:\n` + JSON.stringify(scanEvent),
            endStatus !== ScanEventStatus.Failed ? 'DEBUG' : 'ERR'
        );
        this._connectionManager.endScan(scanEvent);
    }

    public async getMultiScanId(): Promise<string | undefined> {
        if (!this._scanEventPromise || this._multiScanId !== '') {
            // Disabled / already finished waiting and result is stored
            return this._multiScanId;
        }
        this._multiScanId = (await this._scanEventPromise).multi_scan_id;
        return this._multiScanId;
    }

    public get results(): ScanResults {
        return this._resultsData;
    }

    public get viewRoot(): IssuesRootTreeNode {
        return this._resultsViewRoot;
    }

    public get jasRunnerFactory(): JasRunnerFactory {
        return this._jasRunnerFactory;
    }

    public get progressManager(): StepProgress {
        return this._scanProgressManager;
    }
}
