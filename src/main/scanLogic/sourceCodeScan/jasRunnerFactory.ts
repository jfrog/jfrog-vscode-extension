import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { IssuesRootTreeNode } from '../../treeDataProviders/issuesTree/issuesRootTreeNode';
import { StepProgress } from '../../treeDataProviders/utils/stepProgress';
import { ScanResults } from '../../types/workspaceIssuesDetails';
import { AppsConfigModule, JFrogAppsConfig } from '../../utils/jfrogAppsConfig/jfrogAppsConfig';
import { FileScanBundle } from '../../utils/scanUtils';
import { ApplicabilityRunner } from '../scanRunners/applicabilityScan';
import { IacRunner } from '../scanRunners/iacScan';
import { JasRunner } from '../scanRunners/jasRunner';
import { SastRunner } from '../scanRunners/sastScan';
import { SecretsRunner } from '../scanRunners/secretsScan';
import { AnalyzerManager } from '../scanRunners/analyzerManager';
import { SupportedScans } from './supportedScans';
import { PackageType } from '../../types/projectType';
import { UsageJasScanType } from '../../utils/usageUtils';

// The class responsible for managing the creation of different JFrog JAS runners.
export class JasRunnerFactory {
    private _analyzerManager?: AnalyzerManager;
    private _uniqueFeatures: Set<UsageJasScanType> = new Set<UsageJasScanType>();
    constructor(
        private _connectionManager: ConnectionManager,
        protected _logManager: LogManager,
        private scanResults: ScanResults,
        private root: IssuesRootTreeNode,
        private progressManager: StepProgress,
        private supportedScans: SupportedScans
    ) {
        if (this.supportedScans.hasSupportedScan()) {
            this._analyzerManager = new AnalyzerManager(this._connectionManager, this._logManager);
        } else {
            this._logManager.logMessage('JFrog Advanced Security features are not entitled.', 'INFO');
        }
    }

    public get uniqFeatures(): Set<UsageJasScanType> {
        return this._uniqueFeatures;
    }

    public get analyzerManager(): AnalyzerManager | undefined {
        return this._analyzerManager;
    }

    // Jas scanner support JFrog config file. Applicability is not supported by jfrog config so we create a default runner to run on the workspace.
    public createJasRunner(): JasRunner[] {
        let jasRunners: JasRunner[] = [];

        jasRunners.push(...this.createSastRunners());
        jasRunners.push(...this.createIacRunners());
        jasRunners.push(...this.createSecretsRunners());

        return jasRunners;
    }

    private createSastRunners(): SastRunner[] {
        const sastRunners: SastRunner[] = [];
        if (!this.supportedScans?.sast || !this._analyzerManager) {
            this._logManager.logMessage('Static Application Security scanner is not entitled to scan workspace ', 'INFO');
            return sastRunners;
        }
        for (const configModule of this.createModulesConfig()) {
            sastRunners.push(
                new SastRunner(
                    this.scanResults,
                    this.root,
                    this.progressManager,
                    this._connectionManager,
                    this._logManager,
                    configModule,
                    this._analyzerManager
                )
            );
        }
        if (sastRunners.length > 0) {
            this._uniqueFeatures.add(UsageJasScanType.SAST);
        }
        return sastRunners;
    }

    protected createIacRunners(): IacRunner[] {
        const iacRunners: IacRunner[] = [];
        if (!this.supportedScans?.iac || !this._analyzerManager) {
            this._logManager.logMessage('Infrastructure as Code scanner is not entitled to scan workspace', 'INFO');
            return iacRunners;
        }
        for (const configModule of this.createModulesConfig()) {
            iacRunners.push(
                new IacRunner(
                    this.scanResults,
                    this.root,
                    this.progressManager,
                    this._connectionManager,
                    this._logManager,
                    configModule,
                    this._analyzerManager
                )
            );
        }
        if (iacRunners.length > 0) {
            this._uniqueFeatures.add(UsageJasScanType.IAC);
        }
        return iacRunners;
    }

    protected createSecretsRunners(): SecretsRunner[] {
        const secretsRunners: SecretsRunner[] = [];
        if (!this.supportedScans?.secrets || !this._analyzerManager) {
            this._logManager.logMessage('Secrets scanner is not entitled to scan workspace', 'INFO');
            return secretsRunners;
        }
        for (const configModule of this.createModulesConfig()) {
            secretsRunners.push(
                new SecretsRunner(
                    this.scanResults,
                    this.root,
                    this.progressManager,
                    this._connectionManager,
                    this._logManager,
                    configModule,
                    this._analyzerManager
                )
            );
        }
        if (secretsRunners.length > 0) {
            this._uniqueFeatures.add(UsageJasScanType.SECRETS);
        }
        return secretsRunners;
    }

    // Applicability is not supported by jfrog config so we create a default runner to run on the workspace.
    public async createApplicabilityRunner(bundlesWithIssues: FileScanBundle[], packageType: PackageType): Promise<ApplicabilityRunner | undefined> {
        if (!this.supportedScans?.applicability || !this._analyzerManager) {
            this._logManager.logMessage('CVE Applicability scanner is not entitled to scan workspace', 'INFO');
            return undefined;
        }
        this._uniqueFeatures.add(UsageJasScanType.APPLICABILITY);
        return new ApplicabilityRunner(
            bundlesWithIssues,
            packageType,
            this.progressManager,
            this._connectionManager,
            this._logManager,
            this._analyzerManager
        );
    }

    private createModulesConfig(): AppsConfigModule[] {
        const jfrogAppConfig: JFrogAppsConfig = new JFrogAppsConfig(this.root.workspace.uri.fsPath);
        return jfrogAppConfig.modules;
    }
}
