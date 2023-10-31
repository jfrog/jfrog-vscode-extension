import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';

import { ConnectionManager } from '../connect/connectionManager';
import { LogManager } from '../log/logManager';

import { IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { StepProgress } from '../treeDataProviders/utils/stepProgress';
import { ScanUtils } from '../utils/scanUtils';
import { Utils } from '../utils/utils';
import { GraphScanLogic } from './scanGraphLogic';
import { IssuesRootTreeNode } from '../treeDataProviders/issuesTree/issuesRootTreeNode';
import { ScanResults } from '../types/workspaceIssuesDetails';
import { JasRunnerFactory } from './sourceCodeScan/jasRunnerFactory';
import { DependencyUtils } from '../treeDataProviders/utils/dependencyUtils';
import { PackageType } from '../types/projectType';
import { UsageUtils } from '../utils/usageUtils';
import { JasRunner } from './scanRunners/jasRunner';
import { SupportedScans } from './sourceCodeScan/supportedScans';

/**
 * Scan manager is responsible for running the scan on the workspace.
 * It scans the workspace for dependencies and source code vulnerabilities.
 * The scan manager will also send usage report to JFrog.
 */
export class ScanManager implements ExtensionComponent {
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

    /**
     * Scan the workspace for dependencies and source code vulnerabilities.
     */
    public async scanWorkspace(scanResults: ScanResults, root: IssuesRootTreeNode, progressManager: StepProgress, checkCanceled: () => void) {
        let workspaceDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors([root.workspace], this._logManager);

        const entitledJasRunnerFactory: JasRunnerFactory = new JasRunnerFactory(
            this._connectionManager,
            this._logManager,
            scanResults,
            root,
            progressManager,
            await new SupportedScans(this._connectionManager, this._logManager).getSupportedScans()
        );
        const jasRunners: JasRunner[] = await entitledJasRunnerFactory.createConfigurableJasRunner();
        progressManager.startStep('🔎 Scanning for issues', ScanManager.calculateNumberOfTasks(jasRunners, workspaceDescriptors));
        checkCanceled();
        await Promise.all([
            ...this.runDependenciesScans(workspaceDescriptors, root, checkCanceled, scanResults, progressManager, entitledJasRunnerFactory),
            ...this.runAMScans(jasRunners)
        ]);
        UsageUtils.sendUsageReport(entitledJasRunnerFactory.uniqFeatures, workspaceDescriptors, this.connectionManager);
    }

    private runDependenciesScans(
        workspaceDescriptors: Map<PackageType, vscode.Uri[]>,
        root: IssuesRootTreeNode,
        checkCanceled: () => void,
        scanResults: ScanResults,
        progressManager: StepProgress,
        entitledJasRunnerFactory: JasRunnerFactory
    ): Promise<void>[] {
        const scansPromises: Promise<void>[] = [];

        for (const [type, descriptorsPaths] of workspaceDescriptors) {
            checkCanceled();
            scansPromises.push(
                DependencyUtils.scanPackageDependencies(
                    this,
                    scanResults,
                    root,
                    type,
                    descriptorsPaths,
                    progressManager,
                    entitledJasRunnerFactory
                ).catch(error => this._logManager.logError(error, true))
            );
        }
        return scansPromises;
    }

    private runAMScans(jasRunners: JasRunner[]): Promise<void>[] {
        const scansPromises: Promise<void>[] = [];
        for (const runner of jasRunners) {
            if (runner.shouldRun()) {
                scansPromises.push(runner.scan().catch(error => this._logManager.logError(error, true)));
            }
        }
        return scansPromises;
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

    public static calculateNumberOfTasks(jasRunners: JasRunner[], workspaceDescriptors: Map<PackageType, vscode.Uri[]>): number {
        return (
            [...workspaceDescriptors.values()]
                .filter(descriptorsPaths => descriptorsPaths && descriptorsPaths.length > 0)
                .reduce((count, values) => count + values.length, 0) + jasRunners.length
        );
    }
}
