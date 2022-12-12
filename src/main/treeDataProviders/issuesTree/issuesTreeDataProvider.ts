import * as vscode from 'vscode';
import * as path from 'path';
// import * as fs from 'fs';

import { TreesManager } from '../treesManager';
import { BaseFileTreeNode } from './baseFileTreeNode';
import { DescriptorTreeNode } from './descriptorTree/descriptorTreeNode';

import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';

import { DependenciesTreesFactory } from '../dependenciesTree/dependenciesTreeFactory';
import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';
import { ProjectDetails } from '../../types/projectDetails';
import { DependenciesTreeNode } from '../dependenciesTree/dependenciesTreeNode';

// import { ScanLogicManager } from '../../scanLogic/scanLogicManager';
// import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';
import { PackageType } from '../../types/projectType';
import { GeneralInfo } from '../../types/generalInfo';
import { Severity, SeverityUtils } from '../../types/severity';
// import { INodeInfo } from '../../types/nodeInfo';
// import { Utils } from '../utils/utils';
import { IGraphResponse } from 'jfrog-client-js/dist/model/Xray/Scan/GraphResponse';
import { /*IImpactPath, IComponent, IImpactPath,*/ IComponent, IVulnerability, XrayScanProgress } from 'jfrog-client-js';
import { ScanManager } from '../../scanLogic/scanManager';
import { DependencyIssueTreeNode } from './descriptorTree/dependencyIssueTreeNode';
import { CveTreeNode } from './descriptorTree/cveTreeNode';
// import { LogManager } from '../../log/logManager';
// import { IssuesDataProvider } from '../issuesDataProvider';
// import { Utils } from '../utils/utils';
// import { Utils } from '../utils/utils';
import { CveApplicabilityRunner } from '../../utils/cveApplicabilityRunner';
import { IssuesRootTreeNode } from './issuesRootTreeNode';
import { CacheManager } from '../../cache/cacheManager';
import { Utils } from '../utils/utils';
import { StepProgress } from '../utils/stepProgress';
import { IImpactedPath, ILicense } from 'jfrog-ide-webview';
import { DescriptorIssuesData, FileIssuesData, WorkspaceIssuesData } from '../../cache/issuesCache';
// import { CacheObject } from '../../cache/issuesCache';

export class FileScanError extends Error {
    constructor(msg: string, public reason: string) {
        super(msg);
    }
}

export class IssuesTreeDataProvider
    implements vscode.TreeDataProvider<IssuesRootTreeNode | BaseFileTreeNode | DependencyIssueTreeNode | CveTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<IssuesRootTreeNode | BaseFileTreeNode | CveTreeNode | undefined> = new vscode.EventEmitter<
        IssuesRootTreeNode | BaseFileTreeNode | CveTreeNode | undefined
    >();
    readonly onDidChangeTreeData: vscode.Event<IssuesRootTreeNode | BaseFileTreeNode | CveTreeNode | undefined> = this._onDidChangeTreeData.event;

    private _scanInProgress: boolean = false;

    private _workspaceToRoot: Map<vscode.WorkspaceFolder, IssuesRootTreeNode | undefined> = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();

    private _cveApplicabilityRunner: CveApplicabilityRunner;

    constructor(
        protected _workspaceFolders: vscode.WorkspaceFolder[],
        protected _treesManager: TreesManager,
        private _scanManager: ScanManager,
        private _cacheManager: CacheManager
    ) {
        // this._isSingleWorkspace = _workspaceFolders.length === 1;
        this._cveApplicabilityRunner = new CveApplicabilityRunner(_treesManager.connectionManager, _treesManager.logManager);
    }

    public async update() {
        // TODO: move from here to new componenet of update binary
        this._treesManager.logManager.logMessage('<ASSAF> updating data provider', 'DEBUG');
        return await this._cveApplicabilityRunner.update();
    }

    /**
     * Refresh Command implementation (used for Refresh button)
     * updates the workspace data in 'Issues' view.
     * @param scan - if true, runs Xray scan, else get from cache the last old scan
     */
    public async refresh(scan: boolean = true) {
        if (!(await this._treesManager.connectionManager.isSignedIn())) {
            this._treesManager.logManager.logMessage('Refresh: user not signed in - clear data', 'DEBUG');
            this.clearTree();
            return;
        }
        if (!scan) {
            this._treesManager.logManager.logMessage('Refresh: loading data from cache', 'INFO');
            this.loadFromCache();
            return;
        }
        if (this._scanInProgress) {
            vscode.window.showInformationMessage('Previous scan still running...');
            return;
        }
        this._treesManager.logManager.logMessage('Refresh: starting Xray scans', 'INFO');

        this._scanInProgress = true;
        ScanUtils.setScanInProgress(true);

        const startRefreshTimestamp: number = Date.now();
        this.repopulateTree()
            // .then(() => {
            //     vscode.commands.executeCommand('jfrog.xray.focus');
            // })
            .catch(error => this._treesManager.logManager.logError(error, true))
            .finally(() => {
                this._scanInProgress = false;
                ScanUtils.setScanInProgress(false);
                this.onChangeFire();
                this._treesManager.logManager.logMessage(
                    'Xray scans completed 🐸 (elapsed = ' + (Date.now() - startRefreshTimestamp) / 1000 + 'sec)',
                    'INFO'
                );
            });
    }

    public clearTree() {
        this._workspaceToRoot = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();
        this.onChangeFire();
    }

    public async loadFromCache() {
        if (this._cacheManager.issuesCache) {
            let workspaceLoads: Promise<void>[] = [];
            for (const workspace of this._workspaceFolders) {
                const tempRoot: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, 'loading...');
                this._workspaceToRoot.set(workspace, tempRoot);
                workspaceLoads.push(
                    this.loadIssuesFromCache(workspace)
                        .then(root => {
                            if (root) {
                                this._workspaceToRoot.set(workspace, root);
                                root.apply();
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                            } else {
                                this._treesManager.logManager.logMessage("<ASSAF> no cache for workSpace '" + workspace.name + "'", 'DEBUG');
                                this._workspaceToRoot.set(workspace, undefined);
                            }
                        })
                        .catch(error => {
                            this._treesManager.logManager.logMessage("Workspace '" + workspace.name + "' loading ended with error:", 'DEBUG');
                            this._treesManager.logManager.logError(error, true);
                            tempRoot.title = 'loading error';
                        })
                        .finally(() => this.onChangeFire())
                );
            }
            await Promise.all(workspaceLoads);
        }
    }

    private async loadIssuesFromCache(workSpace: vscode.WorkspaceFolder): Promise<IssuesRootTreeNode | undefined> {
        // let raw: string | undefined = this._cacheManager.cache?.get(IssuesCache.toKey(workSpace));
        // this._treesManager.logManager.logMessage('Loading raw data:\n' + raw, 'DEBUG');

        let workspaceData: WorkspaceIssuesData | undefined = this._cacheManager.issuesCache?.get(workSpace);
        if (workspaceData != undefined) {
            this._treesManager.logManager.logMessage("<ASSAF> loading workSpace '" + workSpace.name + "' from cache", 'DEBUG');
            // this._treesManager.logManager.logMessage(
            // "<ASSAF> workspaceData.descriptorsIssuesData '" + workspaceData.descriptorsIssuesData + "' from cache",
            // 'DEBUG'
            // );
            let root: IssuesRootTreeNode = new IssuesRootTreeNode(workSpace);
            if (workspaceData.failedFiles) {
                workspaceData.failedFiles.forEach(file => {
                    this._treesManager.logManager.logMessage("<ASSAF> loading failed file '" + file.fullpath + "' from cache", 'DEBUG');
                    let failed: BaseFileTreeNode = BaseFileTreeNode.createFailedScanNode(file.fullpath, file.name);
                    return root.children.push(failed);
                });
            }
            if (workspaceData.descriptorsIssuesData) {
                workspaceData.descriptorsIssuesData.forEach(descriptor => {
                    this._treesManager.logManager.logMessage("<ASSAF> loading descriptorData '" + descriptor.fullpath + "' from cache", 'DEBUG');
                    // this._treesManager.logManager.logMessage('<ASSAF> loading impacted paths:\n' + Object.entries(descriptor.impactedPaths), 'DEBUG');
                    let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptor.name, root);
                    // descriptor.impactedPaths = new Map<string, IImpactedPath>(Object.entries(descriptor.impactedPaths));
                    this.populateDescriptorData(descriptorNode, descriptor);
                    root.children.push(descriptorNode);
                });
            }

            return root;
        }
        return undefined;
    }

    private async repopulateTree() {
        this.clearTree();

        // TODO: check if update avaliable in connection, make it better
        await this.update();

        let workspaceScans: Promise<void>[] = [];
        for (const workspace of this._workspaceFolders) {
            workspaceScans.push(
                ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
                    let workspaceData: WorkspaceIssuesData = {
                        path: workspace.uri.fsPath,
                        descriptorsIssuesData: [],
                        failedFiles: []
                    } as WorkspaceIssuesData;

                    let workspaceDataCached: WorkspaceIssuesData | undefined = this._cacheManager.issuesCache?.get(workspace);
                    this._treesManager.logManager.logMessage(
                        "Workspace data.descriptorsIssuesData '" + workspaceDataCached?.descriptorsIssuesData,
                        'INFO'
                    );

                    let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, 'scanning...');
                    this._workspaceToRoot.set(workspace, root);

                    await this.repopulateWorkspaceTree(workspaceData, root, progress, checkCanceled)
                        .then(() => {
                            this._treesManager.logManager.logMessage("Workspace '" + workspace.name + "' scan ended", 'INFO');
                            root.apply();
                            root.title = Utils.getLastScanString(root.oldestScanTimestamp); // TODO: maybe replace to ""?, no need to show when scan just completed?
                        })
                        .catch(error => {
                            if (error instanceof ScanCancellationError) {
                                this._treesManager.logManager.logMessage("Workspace '" + workspace.name + "' scan canceled", 'INFO');
                                root.title = 'scan canceled';
                            } else {
                                this._treesManager.logManager.logMessage("Workspace '" + workspace.name + "' scan ended with error:", 'DEBUG');
                                this._treesManager.logManager.logError(error, true);
                                root.title = 'scan failed';
                            }
                        })
                        .finally(() => {
                            if (workspaceData.descriptorsIssuesData.length == 0 && workspaceData.failedFiles.length == 0) {
                                this._workspaceToRoot.set(workspace, undefined);
                            } else if (this._cacheManager.issuesCache) {
                                // this._treesManager.logManager.logMessage('Storing:\n' + IssuesCache.dataToJSON(workspaceData), 'DEBUG');
                                this._cacheManager.issuesCache.store(workspace, workspaceData);
                            }
                            this.onChangeFire();
                        });
                }, "Refreshing workspace '" + workspace.name + "'")
            );
        }
        await Promise.all(workspaceScans);
    }

    private async repopulateWorkspaceTree(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void
    ): Promise<IssuesRootTreeNode> {
        const numberOfSteps: number = 2;
        let onProgress: () => void = () => {
            this.onChangeFire();
            checkCanceled();
        };
        let progressManager: StepProgress = new StepProgress(root, numberOfSteps, this._treesManager.logManager, progress, onProgress);

        progressManager.startStep('👷 Building dependency tree' /* + ' (1/' + progressManager.totalSteps + ')'*/, 2);
        let dependenciesTree: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', ''));
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await this.buildWorkspaceDependencyTree(
            root.workSpace,
            dependenciesTree,
            progressManager
        );

        progressManager.startStep('🔎 Xray scanning' /* + ' (2/' + progressManager.totalSteps + ')'*/, dependenciesTree.children.length);
        let scansPromises: Promise<BaseFileTreeNode | undefined>[] = [];
        // Descriptors scanning
        for (let descriptorRoot of dependenciesTree.children) {
            if (descriptorRoot instanceof RootNode) {
                const descriptorName: string = this.getDescriptorName(descriptorRoot, workspcaeDescriptors);
                const descriptorData: DescriptorIssuesData = { name: descriptorName, fullpath: descriptorRoot.fullPath } as DescriptorIssuesData;
                scansPromises.push(
                    this.createDescriptorScanningIssues(descriptorData, descriptorRoot, progressManager, checkCanceled)
                        .then(descriptor => {
                            if (descriptor) {
                                root.addChildAndApply(descriptor);
                                workspaceData.descriptorsIssuesData.push(descriptorData);
                            }
                            return descriptor;
                        })
                        .catch(error => this.onFileScanError(workspaceData, root, error, descriptorData))
                        .finally(() => onProgress())
                );
            }
        }
        // TODO: Zero-day scanning (source code)

        await Promise.all(scansPromises);

        return root;
    }

    public async buildWorkspaceDependencyTree(
        workSpace: vscode.WorkspaceFolder,
        root: DependenciesTreeNode,
        progressManager: StepProgress
    ): Promise<Map<PackageType, vscode.Uri[]>> {
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
            [workSpace],
            this._treesManager.logManager
        );
        progressManager.reportProgress();
        await DependenciesTreesFactory.createDependenciesTrees(workspcaeDescriptors, [workSpace], [], this._treesManager, root, false);
        this._treesManager.logManager.logMessage(
            'Dependency tree build created ' + root.children.length + " root nodes in workspace '" + workSpace.name + "'",
            'DEBUG'
        );
        progressManager.reportProgress();
        return workspcaeDescriptors;
    }

    private onFileScanError(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        error: Error,
        failedFile?: FileIssuesData
    ): BaseFileTreeNode | undefined {
        if (error instanceof ScanCancellationError || !failedFile) {
            throw error;
        }
        this._treesManager.logManager.logMessage(
            "Workspace '" + root.workSpace.name + "' scan on file '" + failedFile.fullpath + "' ended with error.",
            'DEBUG'
        );
        this._treesManager.logManager.logError(error, true);

        workspaceData.failedFiles.push(failedFile);
        let failReason: string | undefined;
        if (error instanceof FileScanError) {
            failReason = error.reason;
            failedFile.name = error.reason;
        }
        return root.addChildAndApply(BaseFileTreeNode.createFailedScanNode(failedFile.fullpath, failReason));
    }

    private async createDescriptorScanningIssues(
        descriptorData: DescriptorIssuesData,
        descriptorRoot: RootNode,
        stepProgress: StepProgress,
        checkCanceled: () => void
    ): Promise<DescriptorTreeNode | undefined> {
        // Descriptor Not install - no need for scan
        if (descriptorRoot.label?.toString().includes('[Not installed]')) {
            stepProgress.reportProgress();
            throw new FileScanError("Descriptor '" + descriptorData.name + "' is not installed", '[Not installed]');
        }
        // Scan descriptor
        let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptorData.name);
        let scanProgress: XrayScanProgress = stepProgress.createScanProgress(descriptorRoot.generalInfo.artifactId);
        this._treesManager.logManager.logMessage("Scanning descriptor '" + descriptorData.name + "' for issues", 'DEBUG');
        let issuesCount: number = await this.scanDescriptor(descriptorNode, descriptorData, descriptorRoot, scanProgress, checkCanceled).finally(() =>
            scanProgress.setPercentage(100)
        );
        return issuesCount > 0 ? descriptorNode : undefined;
    }

    private async scanDescriptor(
        descriptorNode: DescriptorTreeNode,
        descriptorData: DescriptorIssuesData,
        descriptorGraph: RootNode,
        progress: XrayScanProgress,
        checkCanceled: () => void
    ): Promise<number> {
        // Dependency graph scanning
        let startGraphScan: number = Date.now();
        descriptorData.dependenciesGraphScan = await this._scanManager.scanDependencyGraph(progress, descriptorGraph, checkCanceled);
        descriptorData.graphScanTimestamp = Date.now();

        if (!descriptorData.dependenciesGraphScan.vulnerabilities && !descriptorData.dependenciesGraphScan.vulnerabilities) {
            this._treesManager.logManager.logMessage(
                "No issues found for descriptor '" +
                    descriptorGraph.generalInfo.artifactId +
                    "' (elapsed=" +
                    (descriptorData.graphScanTimestamp - startGraphScan) / 1000 +
                    'sec)',
                'INFO'
            );
            return 0;
        }
        this._treesManager.logManager.logMessage(
            "found '" +
                ((descriptorData.dependenciesGraphScan.vulnerabilities ? descriptorData.dependenciesGraphScan.vulnerabilities.length : 0) +
                    (descriptorData.dependenciesGraphScan.violations ? descriptorData.dependenciesGraphScan.violations.length : 0)) +
                "' vulnerabilities/violations for descriptor '" +
                descriptorGraph.generalInfo.artifactId +
                "' (elapsed=" +
                (descriptorData.graphScanTimestamp - startGraphScan) / 1000 +
                'sec)',
            'INFO'
        );
        descriptorData.convertedImpact = Object.fromEntries(
            this.createImpactedPaths(descriptorGraph, descriptorData.dependenciesGraphScan).entries()
        );
        // TODO: applicability scan for the descriptor

        return this.populateDescriptorData(descriptorNode, descriptorData);
    }

    public getImpactedTree(pkgType: PackageType, path?: string): DependenciesTreeNode | undefined {

    }

    // TODO: Move to ScanUtils
    private createImpactedPaths(descriptorGraph: RootNode, response: IGraphResponse): Map<string, IImpactedPath> {
        let paths: Map<string, IImpactedPath> = new Map<string, IImpactedPath>();
        let issues: IVulnerability[] = response.violations ? response.violations : response.vulnerabilities;

        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability = issues[i];
            let impactedPath: IImpactedPath = {
                name: descriptorGraph.componentId,
                children: this.getImapct(descriptorGraph, new Map<string, IComponent>(Object.entries(issue.components)))
            } as IImpactedPath;
            paths.set(issue.issue_id, impactedPath);
        }
        return paths;
    }
    // TODO: Move to ScanUtils
    private getImapct(root: DependenciesTreeNode, componentsWithIssue: Map<string, IComponent>): IImpactedPath[] {
        let impactPaths: IImpactedPath[] = [];
        for (let child of root.children) {
            // Direct impact
            if (child.dependencyId && componentsWithIssue.has(child.dependencyId)) {
                impactPaths.push({
                    name: child.componentId,
                    children: []
                } as IImpactedPath);
                continue;
            }
            // indirect impact
            let impactChild: IImpactedPath | undefined = impactPaths.find(p => p.name === child.componentId);
            if (!impactChild) {
                let indirectImpact: IImpactedPath[] = this.getImapct(child, componentsWithIssue);
                if (indirectImpact.length > 0) {
                    impactPaths.push({
                        name: child.componentId,
                        children: indirectImpact
                    } as IImpactedPath);
                }
            }
        }
        return impactPaths;
    }
    // TODO: Move to ScanUtils
    private populateDescriptorData(descriptorNode: DescriptorTreeNode, descriptorData: DescriptorIssuesData): number {
        let graphResponse: IGraphResponse = descriptorData.dependenciesGraphScan;
        let impactedPaths: Map<string, IImpactedPath> = new Map<string, IImpactedPath>(Object.entries(descriptorData.convertedImpact));
        // this._treesManager.logManager.logMessage('impact: ' + impactedPaths, 'DEBUG');
        impactedPaths;

        // TODO: remove saving files below
        // let scanPath: string = '/Users/assafa/Documents/testyWithTree' + Utils.getLastSegment(descriptorNode.filePath) + '.json';
        // fs.writeFileSync(scanPath, JSON.stringify(graphResponse));

        let issues: IVulnerability[] = graphResponse.violations ? graphResponse.violations : graphResponse.vulnerabilities;
        let topSeverity: Severity = Severity.Unknown;
        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability = issues[i];
            let impactedPath: IImpactedPath | undefined = impactedPaths.get(issue.issue_id);
            // this._treesManager.logManager.logMessage("impacted path for '" + issue.issue_id + "':\n" + impactedPath, 'DEBUG');
            let severity: Severity = SeverityUtils.getSeverity(issue.severity);
            if (severity > topSeverity) {
                topSeverity = severity;
            }

            for (let [componentId, component] of Object.entries(issue.components)) {
                let dependencyWithIssue: DependencyIssueTreeNode | undefined = descriptorNode.getDependencyByID(componentId);

                if (dependencyWithIssue == undefined) {
                    dependencyWithIssue = new DependencyIssueTreeNode(componentId, component, severity, descriptorNode, impactedPath);
                    descriptorNode.dependenciesWithIssue.push(dependencyWithIssue);
                } else if (severity > dependencyWithIssue.topSeverity) {
                    dependencyWithIssue.topSeverity = severity;
                }

                for (let cveIssue of issue.cves) {
                    dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, cveIssue));
                }
            }
        }
        descriptorNode.severity = topSeverity;
        descriptorNode.dependencyScanTimeStamp = descriptorData.graphScanTimestamp;

        // issues.forEach(issue => {
        //     let severity: Severity = SeverityUtils.getSeverity(issue.severity);
        //     if (severity > topSeverity) {
        //         topSeverity = severity;
        //     }
        //     // Create dependency component with issues
        //     // for (let component of Object.values(issue.components)) {
        //     for (let [componentId, component] of Object.entries(issue.components)) {
        //         let dependencyWithIssue: DependencyIssueTreeNode | undefined = descriptorNode.getDependencyByID(componentId);
        //         if (dependencyWithIssue == undefined) {
        //             dependencyWithIssue = new DependencyIssueTreeNode(componentId, component, severity, descriptorNode);
        //             descriptorNode.dependenciesWithIssue.push(dependencyWithIssue);
        //         } else if (severity > dependencyWithIssue.topSeverity) {
        //             dependencyWithIssue.topSeverity = severity;
        //         }

        //         // Create issues for the dependency
        //         for (let cveIssue of issue.cves) {
        //             dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, cveIssue));
        //             // if (!!cveIssue.cve) {
        //             //     dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, cveIssue));
        //             // } else {
        //             //     dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue));
        //             // }
        //         }
        //     }
        // });

        graphResponse.licenses.forEach(license => {
            Object.values(license.components).forEach(component => {
                let dependencyWithIssue: DependencyIssueTreeNode | undefined = descriptorNode.searchDependency(
                    component.package_type,
                    component.package_name,
                    component.package_version
                );
                if (dependencyWithIssue != undefined) {
                    dependencyWithIssue.licenses.push({ name: license.license_name } as ILicense); // TODO: tell or, what is the plan about those
                }
            });
        });

        return descriptorNode.dependenciesWithIssue.length;
    }

    // TODO: Move to ScanUtils
    // returns the full path of the descriptor file if exsits in map or artifactId of the root otherwise
    private getDescriptorName(descriptorRoot: RootNode, workspcaeDescriptors: Map<PackageType, vscode.Uri[]>): string {
        // TODO: insert this inside the logic of building the tree ?
        let details: ProjectDetails = descriptorRoot.projectDetails;
        let descriptorName: string = descriptorRoot.generalInfo.artifactId;
        let typeDescriptors: vscode.Uri[] | undefined = workspcaeDescriptors.get(details.type);
        if (typeDescriptors != undefined) {
            for (let descriptor of typeDescriptors) {
                let descriptorDir: string = path.dirname(descriptor.fsPath);
                if (descriptorDir == details.path) {
                    descriptorName = descriptor.fsPath;
                    break;
                }
            }
        }
        return descriptorName;
    }

    // Structure of the tree
    getChildren(
        element?: /*TempRoot | ProjectRootTreeNode |*/ IssuesRootTreeNode | BaseFileTreeNode | DependencyIssueTreeNode //| CveTreeNode
    ): vscode.ProviderResult<any> {
        // Root
        if (!element) {
            let roots: IssuesRootTreeNode[] = [];
            for (const root of this._workspaceToRoot.values()) {
                if (root) {
                    roots.push(root);
                }
            }
            return Promise.resolve(roots);
        }
        if (element instanceof IssuesRootTreeNode) {
            return Promise.resolve(element.children);
        }
        // Descriptor file type
        if (element instanceof DescriptorTreeNode) {
            return Promise.resolve(element.dependenciesWithIssue);
        }
        if (element instanceof DependencyIssueTreeNode) {
            return Promise.resolve(element.issues);
        }
        // TODO: Zero-day file type
    }

    getTreeItem(
        element: /*TempRoot | ProjectRootTreeNode |*/ IssuesRootTreeNode | BaseFileTreeNode | DependencyIssueTreeNode | CveTreeNode
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        // TODO: Root
        // if (element instanceof ProjectRootTreeNode) {
        //     // element.iconPath = PackageDescriptorUtils.getIcon(element.details.type);
        //     // element.command = Utils.createNodeCommand('jfrog.xray.focus', '', [element.details.path]);
        //     return element;
        // }

        // Descriptor file type
        if (element instanceof BaseFileTreeNode) {
            element.command = Utils.createNodeCommand('jfrog.xray.file.open', 'Open File', [element]);
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
        }
        if (element instanceof DependencyIssueTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.topSeverity !== undefined ? element.topSeverity : Severity.Unknown);
            return element;
        }
        if (element instanceof CveTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
            element.command = Utils.createNodeCommand('view.dependency.details.page', 'Show details', [element.asDetailsPage()]);
            return element;
        }

        // TODO: Source code file type

        // TODO: general / default config
        // if (element) {
        // }

        // if (element instanceof DependenciesTreeNode) {
        //     element.command = Utils.createNodeCommand('jfrog.xray.focus', '', [element]);
        //     let topSeverity: Severity = element.topSeverity;
        //     element.iconPath = SeverityUtils.getIcon(topSeverity ? topSeverity : Severity.Normal);
        // }
        // if (element instanceof DependenciesTreeNode) {
        //     element.command = Utils.createNodeCommand('jfrog.xray.focus', '', [element]);
        //     let topSeverity: Severity = element.topSeverity;
        //     element.iconPath = SeverityUtils.getIcon(topSeverity ? topSeverity : Severity.Normal);
        //     return element;
        // }
        // if (element instanceof SourceCodeCveTreeNode) {
        //     element.command = Utils.createNodeCommand('jfrog.source.code.scan.jumpToSource', 'Show in source code', [element]);
        //     element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
        //     return element;
        // }
        // if (element instanceof TreeDataHolder) {
        //     let holder: TreeDataHolder = <TreeDataHolder>element;
        //     let treeItem: vscode.TreeItem = new vscode.TreeItem(holder.key);
        //     treeItem.description = holder.value;
        //     treeItem.contextValue = holder.context;
        //     treeItem.command = holder.command;
        //     if (holder.link) {
        //         treeItem.command = {
        //             command: 'vscode.open',
        //             arguments: [vscode.Uri.parse(holder.link)]
        //         } as vscode.Command;
        //     }
        //     return treeItem;
        // }
        return element;
    }

    public getParent(element: BaseFileTreeNode): Thenable<IssuesRootTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
