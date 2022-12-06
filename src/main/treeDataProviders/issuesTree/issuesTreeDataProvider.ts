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
import { PackageType, toPackgeType } from '../../types/projectType';
import { GeneralInfo } from '../../types/generalInfo';
import { Severity, SeverityUtils } from '../../types/severity';
// import { INodeInfo } from '../../types/nodeInfo';
// import { Utils } from '../utils/utils';
import { IGraphResponse } from 'jfrog-client-js/dist/model/Xray/Scan/GraphResponse';
import { /*IImpactPath, IComponent,*/ IVulnerability, XrayScanProgress } from 'jfrog-client-js';
import { ScanManager } from '../../scanLogic/scanManager';
import { IssueDependencyTreeNode } from './descriptorTree/issueDependencyTreeNode';
import { CveTreeNode } from './descriptorTree/cveTreeNode';
import { LogManager } from '../../log/logManager';
// import { IssuesDataProvider } from '../issuesDataProvider';
// import { Utils } from '../utils/utils';
// import { Utils } from '../utils/utils';
import { CveApplicabilityRunner } from '../../utils/cveApplicabilityRunner';
import { IssuesRootTreeNode } from './issuesRootTreeNode';
import { CacheManager } from '../../cache/cacheManager';
import { Utils } from '../utils/utils';
// import { CacheObject } from '../../cache/issuesCache';

export class IssuesTreeDataProvider implements vscode.TreeDataProvider<IssuesRootTreeNode | BaseFileTreeNode> {

    private _issuesTreeView!: vscode.TreeView<IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode>;

    private _onDidChangeTreeData: vscode.EventEmitter<IssuesRootTreeNode | BaseFileTreeNode | undefined> = new vscode.EventEmitter<IssuesRootTreeNode | BaseFileTreeNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<IssuesRootTreeNode | BaseFileTreeNode | undefined> = this._onDidChangeTreeData.event;

    public static readonly MULTI_WORKSPACE_PROGRESS_MSG: string = '🗂️ Workspace scanning';
    private static readonly TOTAL_PROGRESS: number = 90;

    private _scanInProgress: boolean = false;
    private _isSingleWorkspace: boolean = true;

    private _workspaceToRoot: Map<vscode.WorkspaceFolder,IssuesRootTreeNode | undefined> = new Map<vscode.WorkspaceFolder,IssuesRootTreeNode>();
    private _lastUpdateTime: number | undefined;


    private _cachedWorkspaceToRoot: Map<vscode.WorkspaceFolder,IssuesRootTreeNode | undefined> | undefined;
    private _cachedlastUpdateTime: number | undefined;
    
    private _cveApplicabilityRunner: CveApplicabilityRunner;

    constructor(
        protected _workspaceFolders: vscode.WorkspaceFolder[],
        protected _treesManager: TreesManager,
        private _scanManager: ScanManager,
        private _cacheManager: CacheManager
    ) {
        this._isSingleWorkspace = _workspaceFolders.length === 1;
        this._cveApplicabilityRunner = new CveApplicabilityRunner(_treesManager.connectionManager, _treesManager.logManager);
    }

    public async update() {
        this._treesManager.logManager.logMessage("<ASSAF> updating data provider", 'DEBUG');
        return await this._cveApplicabilityRunner.update();
    }

    /**
     * Refresh Command implementation (used for Refresh button)
     * updates the 'Issues' view and fires change event to redraw view.
     * @param scan - if true, runs Xray scan
     */
    public async refresh(scan: boolean = true) {
        if (!(await this._treesManager.connectionManager.isSignedIn())) {    
            this.clearTree();
            this.onChangeFire();
            return;
        }
        if (!scan) {
            this.loadFromCache();
            this.onChangeFire();
            return;
        }
        if (this._scanInProgress) {
            vscode.window.showInformationMessage('Previous scan still running...');
            return;
        }
        this._treesManager.logManager.logMessage('Starting Xray scans', 'INFO');
        let revertOnCancle: boolean = false;
        let revertOnError: boolean = false;
        this._scanInProgress = true;
        ScanUtils.setScanInProgress(true);
        this._cachedWorkspaceToRoot = this._workspaceToRoot;
        this._cachedlastUpdateTime = this._lastUpdateTime;
        this.setViewDescription("scanning...");
        this.repopulateTree()
            .then(() => {
                vscode.commands.executeCommand('jfrog.xray.focus');
            })
            .catch(error => {
                this.clearTree();
                if (error instanceof ScanCancellationError) {
                    vscode.window.showInformationMessage(error.message);
                    if (revertOnCancle && this._cachedWorkspaceToRoot) {
                        // return to state before starting the scan
                        this._workspaceToRoot = this._cachedWorkspaceToRoot;
                        this._lastUpdateTime = this._cachedlastUpdateTime;
                        this.setViewDescription(Utils.toDate(this._lastUpdateTime));
                    } else {
                        this.setViewDescription("scan canceled");
                    }
                } else {
                    this._treesManager.logManager.logError(error, true);
                    if (revertOnError && this._cachedWorkspaceToRoot) {
                        // return to state before starting the scan
                        this._workspaceToRoot = this._cachedWorkspaceToRoot;
                        this._lastUpdateTime = this._cachedlastUpdateTime;
                        this.setViewDescription(Utils.toDate(this._lastUpdateTime));
                    }
                }
                this._treesManager.logManager.logMessage(error,'DEBUG');
            })
            .finally(() => {
                this._cachedWorkspaceToRoot = undefined;
                this._scanInProgress = false;
                ScanUtils.setScanInProgress(false);
                this.onChangeFire();
                this._treesManager.logManager.logMessage('Xray scans completed 🐸', 'INFO');
            });
    }

    public clearTree() {
        this._workspaceToRoot = new Map<vscode.WorkspaceFolder,IssuesRootTreeNode>();
    }

    private loadFromCache() {
        for(const workSpace of this._workspaceFolders) {
            if (this._cacheManager.issuesCache != undefined) {
                this._workspaceToRoot.set(workSpace, this._cacheManager.issuesCache.get(workSpace));
            } else {
                this._workspaceToRoot.set(workSpace,undefined);
            }
        }
    }

    private saveToCache(workSpace: vscode.WorkspaceFolder, node: IssuesRootTreeNode) {
        if (this._cacheManager.issuesCache) {
            this._cacheManager.issuesCache.store(workSpace,node);
        }
    }

    private async repopulateTree() {
        await ScanUtils.scanWithProgress(
            async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
                // Initialize
                const updatePromise: Promise<void> = this.update();
                this.clearTree();
                this.onChangeFire();
                let step: number = IssuesTreeDataProvider.TOTAL_PROGRESS;
                if (!this._isSingleWorkspace) {
                    progress.report({ message: IssuesTreeDataProvider.MULTI_WORKSPACE_PROGRESS_MSG, increment: 0});
                    step /= this._workspaceFolders.length;
                }
                await updatePromise;
                // Repopulate tree for every workspace
                let workspaceScans: Promise<IssuesRootTreeNode | undefined>[] = [];
                for (const workspace of this._workspaceFolders) {
                    workspaceScans.push(this.repopulateWorkspaceTree(workspace,progress,step,checkCanceled));
                }
                await Promise.all(workspaceScans);
                // Update view
                this.calculateLastScanTimeStamp();
                this.onChangeFire();
            },
            'Project Scanning',false
        );
    }    

    private async repopulateWorkspaceTree (workspace: vscode.WorkspaceFolder, progress: vscode.Progress<{ message?: string; increment?: number }>, workspaceTotalProgressInc: number, checkCanceled: () => void): Promise<IssuesRootTreeNode> {
        // Initialize
        let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace);
        this._workspaceToRoot.set(workspace,root);
        const numberOfSteps: number = 2;
        const progressStepInc: number = workspaceTotalProgressInc / numberOfSteps;
        // Step 1 - build dependency tree of the workspace
        if (this._isSingleWorkspace) {
            progress.report({ message: '1/' + numberOfSteps + ':👷 Building dependency tree' });
        } 
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors([workspace],this._treesManager.logManager);
        let dependenciesTree : DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', ''));
        await DependenciesTreesFactory.createDependenciesTrees(workspcaeDescriptors,[workspace],[],this._treesManager,dependenciesTree,false);
        if (!this._isSingleWorkspace) {
            progress.report({ message: IssuesTreeDataProvider.MULTI_WORKSPACE_PROGRESS_MSG, increment: progressStepInc});
        } 
        checkCanceled();
        this._treesManager.logManager.logMessage("<ASSAF> dependenciesTree.children = " + dependenciesTree.children,'DEBUG');
        // Step 2 - Xray async scanning
        let scanProgressMsg: string = this._isSingleWorkspace ? '2/' + numberOfSteps + ':🔎 Xray scanning' : IssuesTreeDataProvider.MULTI_WORKSPACE_PROGRESS_MSG;
        let scanProgressStep: number = progressStepInc;
        if (this._isSingleWorkspace) {
            progress.report({ message: scanProgressMsg, increment: 0 });
            scanProgressStep = IssuesTreeDataProvider.TOTAL_PROGRESS / dependenciesTree.children.length;
        } 
        let scansPromises: Promise<BaseFileTreeNode | undefined>[] = [];
        // TODO: remove total when progress bar is fixed
        this._testTotal = 0;
        // Descriptors scanning
        if (dependenciesTree.children.length > 0) {
            for(let descriptorRoot of dependenciesTree.children) {
                if(descriptorRoot instanceof RootNode) {
                    // Descriptor Not install - no need for scan
                    if (descriptorRoot.label?.toString().includes('[Not installed]')) {
                        progress.report({ message: scanProgressMsg, increment: scanProgressStep});
                        root.addChildAndApply(DescriptorTreeNode.createFailedScanNode(descriptorRoot.label.toString()));
                        this.onChangeFire();
                    }
                    // Scan descriptor
                    scansPromises.push(this.scanDescriptor(
                        root,
                        this.getDescriptorName(descriptorRoot,workspcaeDescriptors),
                        descriptorRoot,
                        this.createDescriptorScanProgress(descriptorRoot.generalInfo.artifactId, progress, scanProgressMsg, scanProgressStep),
                        checkCanceled
                    ));
                }
            }
        }
        // TODO: Zero-day scanning (source code)

        await Promise.all(scansPromises);
        if (!this._isSingleWorkspace) {
            progress.report({ message: scanProgressMsg, increment: progressStepInc});
        }
        // Update view and cache
        root.apply();
        this.onChangeFire();
        this.saveToCache(workspace,root);
        return root;
    }

    private async scanDescriptor(root: IssuesRootTreeNode, descriptorName: string, descriptor: RootNode, progress: XrayScanProgress, checkCanceled: () => void): Promise<DescriptorTreeNode | undefined> {
        let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptorName, root);

        // Dependency graph scanning
        let startTime: number = Date.now();
        let graphResponse: IGraphResponse = await this._scanManager.scanDependencyGraph(progress, descriptor, checkCanceled);
        if (!graphResponse.vulnerabilities && !graphResponse.vulnerabilities) {
            this._treesManager.logManager.logMessage("No issues found for descriptor '" + descriptor.generalInfo.artifactId +"' (elapsed=" + ((Date.now() - startTime) / 1000) + "sec)", 'DEBUG');
            return undefined;
        }
        this._treesManager.logManager.logMessage("found '" + 
            ((graphResponse.vulnerabilities ? graphResponse.vulnerabilities.length : 0) + 
            (graphResponse.violations ? graphResponse.violations.length : 0)) + 
            "' vulnerabilities/violations for descriptor '" + descriptor.generalInfo.artifactId +"' (elapsed=" + ((Date.now() - startTime) / 1000) + "sec)",'DEBUG'
        );
        descriptorNode.dependencyScanTimeStamp = startTime;
        this.populateGraphScanResponse(descriptorNode,graphResponse);
        // TODO: applicability scan
        
        // Update view with new node
        root.addChildAndApply(descriptorNode);
        this.onChangeFire();
        return descriptorNode;
    }

    private populateGraphScanResponse(descriptorNode: DescriptorTreeNode, graphResponse: IGraphResponse) {
        // TODO: remove saving files below
        // let scanPath: string = '/Users/assafa/Documents/testyWithTree' + Utils.getLastSegment(descriptor.generalInfo.artifactId) + '.json';
        // fs.writeFileSync(scanPath, JSON.stringify(graphResponse));
        let issues: IVulnerability[] = graphResponse.violations ? graphResponse.violations : graphResponse.vulnerabilities;
        let topSeverity: Severity = Severity.Unknown;
        // let issueDependencies: IssueDependencyTreeNode[] = [];
        
        // let issueDependencies: 
        issues.forEach(issue => {
            let severity: Severity = SeverityUtils.getSeverity(issue.severity);
            if (severity > topSeverity)
            {
                topSeverity = severity;
            }
            // Create dependency component with issues
            // for (let component of Object.values(issue.components)) {
            for (let [componentId, component] of Object.entries(issue.components)) {
                let dependencyWithIssue: IssueDependencyTreeNode | undefined = descriptorNode.getDependency(componentId);
                if (dependencyWithIssue == undefined) {
                    dependencyWithIssue = new IssueDependencyTreeNode(
                        componentId,
                        component.package_name,
                        component.package_version,
                        toPackgeType(component.package_type),
                        severity,
                        descriptorNode
                    );
                    descriptorNode.dependenciesWithIssue.push(dependencyWithIssue);
                } else if (severity > dependencyWithIssue.topSeverity)
                {
                    dependencyWithIssue.topSeverity = severity;
                }

                // Create issues for the dependency
                for (let cveIssue of issue.cves) {
                    if (!!cveIssue.cve) {
                        dependencyWithIssue.issues.push(new CveTreeNode(cveIssue.cve, severity, dependencyWithIssue));
                    } else {
                        dependencyWithIssue.issues.push(new CveTreeNode(issue.issue_id, severity, dependencyWithIssue));
                    }
                    
                }
            }
        });
        // graphResponse.violations.forEach(violation => {
        //     violation.components.get("")?.impact_paths.forEach(impactPathEntry => {
        //         let issueComponent: IImpactPath = impactPathEntry[impactPathEntry.length - 1];
        //     });
        // });
        
        descriptorNode.severity = topSeverity;
        descriptorNode.apply();
    }

    // returns the full path of the descriptor file if exsits in map or artifactId of the root otherwise 
    private getDescriptorName(descriptorRoot: RootNode, workspcaeDescriptors: Map<PackageType, vscode.Uri[]>) : string {
        // TODO: insert this inside the logic of building the tree ?
        let details: ProjectDetails = descriptorRoot.projectDetails;
        let descriptorName: string = descriptorRoot.generalInfo.artifactId;
        let typeDescriptors: vscode.Uri[] | undefined  = workspcaeDescriptors.get(details.type);
        if (typeDescriptors != undefined) {
            for(let descriptor of typeDescriptors) {
                let descriptorDir: string = path.dirname(descriptor.fsPath);
                if (descriptorDir == details.path) {
                    descriptorName = descriptor.fsPath;
                    break;
                }
            }
        }
        return descriptorName;
    }

    private _testTotal: number = 0;

    private createDescriptorScanProgress(id: string, progress: vscode.Progress<{ message?: string; increment?: number }>, progressMsg: string, totalIncrement: number): XrayScanProgress {
        return new class implements XrayScanProgress {
            private lastPercentage: number = 0;
            constructor(private _log: LogManager, private _test: IssuesTreeDataProvider){}
            /** @override */
            public setPercentage(percentage: number): void {
                if (percentage != this.lastPercentage) {
                    let inc: number = totalIncrement * ((percentage - this.lastPercentage) / 100);
                    this._test._testTotal += inc;
                    this._log.logMessage("[" + id + "] reported change in progress " + this.lastPercentage + "% -> " + percentage + "% (increment = " + inc + "% / "+totalIncrement+"%)",'DEBUG');
                    this._log.logMessage("Overall progress done: " + this._test._testTotal + "%",'DEBUG');
                    progress.report({ message: progressMsg, increment: inc});
                }
                this.lastPercentage = percentage;
            }
        }(this._treesManager.logManager,this)
    }

    private calculateLastScanTimeStamp() {
        let oldestTimeStamp: number | undefined;
        // Update
        for (let root of this._workspaceToRoot.values()) {
            if (root) {
                let rootOldestTimeStamp: number | undefined;
                for (let file of root.children) {
                    let timestamp: number | undefined = file.timeStamp;
                    if (timestamp && (!rootOldestTimeStamp || timestamp < rootOldestTimeStamp)) {
                        rootOldestTimeStamp = timestamp;
                    }
                }
                root.lastScanTimestamp = rootOldestTimeStamp;
                if (rootOldestTimeStamp && (!oldestTimeStamp || rootOldestTimeStamp < oldestTimeStamp)) {
                    oldestTimeStamp = rootOldestTimeStamp;
                }
            }
        }
        // Set on view
        this._lastUpdateTime = oldestTimeStamp;
        this.setViewDescription(Utils.getLastScanString(this._lastUpdateTime));
    }

    private setViewDescription(description: string | undefined) {
        if (this._issuesTreeView) {
            this.issuesTreeView.description = description;
        }
    }

    // Structure of the tree
    getChildren(
        element?: /*TempRoot | ProjectRootTreeNode |*/IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode //| CveTreeNode
    ): vscode.ProviderResult<any> {
        // Root
        if (!element) {
            let roots: IssuesRootTreeNode[] = [];
            for (const root of this._workspaceToRoot.values()) {
                this._treesManager.logManager.logMessage("<ASSAF> _workspaceToRoot.children = " + (root ? root.children.length : undefined),'DEBUG');
                if (root && root.children.length > 0) {
                    roots.push(root);
                }
            }
            if(this._isSingleWorkspace && roots.length == 1) {
                return Promise.resolve(roots[0].children);
            }
            return Promise.resolve(roots);
        }
        if (element instanceof IssuesRootTreeNode){
            return Promise.resolve(element.children);
        }
        // Descriptor file type
        if (element instanceof DescriptorTreeNode){
            return Promise.resolve(element.dependenciesWithIssue);
        }
        if (element instanceof IssueDependencyTreeNode){
            return Promise.resolve(element.issues);
        }
        // TODO: Source code file type
    }

    getTreeItem(
        element: /*TempRoot | ProjectRootTreeNode |*/IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        // TODO: Root
        // if (element instanceof ProjectRootTreeNode) {
        //     // element.iconPath = PackageDescriptorUtils.getIcon(element.details.type);
        //     // element.command = Utils.createNodeCommand('jfrog.xray.focus', '', [element.details.path]);
        //     return element;
        // }

        // Descriptor file type
        if (element instanceof DescriptorTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
            return element;
        }
        if (element instanceof IssueDependencyTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.topSeverity !== undefined ? element.topSeverity : Severity.Unknown);
            return element;
        }
        if (element instanceof CveTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
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

    public getParent(
        element: BaseFileTreeNode
    ): Thenable<IssuesRootTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    public get issuesTreeView(): vscode.TreeView<IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode> {
        return this._issuesTreeView;
    }

    public set issuesTreeView(value: vscode.TreeView<IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode>) {
        this._issuesTreeView = value;
    }

    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}