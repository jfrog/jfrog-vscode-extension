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

    private _scanEvent?: ScanEvent;
    private _status?: ScanEventStatus;

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
            is_default_config: !JFrogAppsConfig.isConfigFileExist(this._resultsData.path)
        };
        this._scanEvent = await this._connectionManager.startScan(request);
    }

    public async endScan(): Promise<void> {
        if (!this._scanEvent || !this._scanEvent.multi_scan_id) {
            // Analytics are disabled / failed to start scan
            return;
        }

        this._scanEvent.total_scan_duration = `${Date.now() - this._startTime}`;
        this._scanEvent.event_status = this.status;
        this._scanEvent.total_findings = this._resultsData.issueCount;
        this._scanEvent.total_ignored_findings = this._resultsData.ignoreIssueCount;

        this._logManager.logMessage(
            `'${this.viewRoot.workspace.uri.fsPath}' Scan event result:\n` + JSON.stringify(this._scanEvent),
            this.status !== ScanEventStatus.Failed ? 'DEBUG' : 'ERR'
        );
        this._connectionManager.endScan(this._scanEvent);
    }

    public get multiScanId(): string | undefined {
        return this._scanEvent?.multi_scan_id;
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

    get status(): ScanEventStatus {
        return this._status ?? (this._resultsData.failedFiles.length > 0 ? ScanEventStatus.Failed : ScanEventStatus.Completed);
    }

    set status(value: ScanEventStatus | undefined) {
        this._status = value;
    }
}
