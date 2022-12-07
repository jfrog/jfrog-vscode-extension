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
import { /*IImpactPath, IComponent, IImpactPath,*/ IVulnerability, XrayScanProgress } from 'jfrog-client-js';
import { ScanManager } from '../../scanLogic/scanManager';
import { IssueDependencyTreeNode } from './descriptorTree/issueDependencyTreeNode';
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
import { IImpactedPath } from 'jfrog-ide-webview';
// import { CacheObject } from '../../cache/issuesCache';

export class IssuesTreeDataProvider
    implements vscode.TreeDataProvider<IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<IssuesRootTreeNode | BaseFileTreeNode | CveTreeNode | undefined> = new vscode.EventEmitter<
        IssuesRootTreeNode | BaseFileTreeNode | CveTreeNode | undefined
    >();
    readonly onDidChangeTreeData: vscode.Event<IssuesRootTreeNode | BaseFileTreeNode | CveTreeNode | undefined> = this._onDidChangeTreeData.event;

    private _scanInProgress: boolean = false;
    // private _isSingleWorkspace: boolean = true;

    private _workspaceToRoot: Map<vscode.WorkspaceFolder, IssuesRootTreeNode | undefined> = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();

    private _cachedWorkspaceToRoot: Map<vscode.WorkspaceFolder, IssuesRootTreeNode | undefined> | undefined;

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
            // this.loadFromCache();
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
        // this._cachedlastUpdateTime = this._lastUpdateTime;
        // this.setViewDescription("scanning...");
        this.repopulateTree()
            .then(() => {
                vscode.commands.executeCommand('jfrog.xray.focus');
            })
            .catch(error => {
                if (error instanceof ScanCancellationError) {
                    vscode.window.showInformationMessage(error.message);
                    if (revertOnCancle && this._cachedWorkspaceToRoot) {
                        // return to the state before starting the scan
                        this._workspaceToRoot = this._cachedWorkspaceToRoot;
                    }
                } else {
                    this._treesManager.logManager.logError(error, true);
                    if (revertOnError && this._cachedWorkspaceToRoot) {
                        // return to the state before starting the scan
                        this._workspaceToRoot = this._cachedWorkspaceToRoot;
                    }
                }
                this._treesManager.logManager.logMessage(error, 'DEBUG');
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
        this._workspaceToRoot = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();
    }

    // private loadFromCache() {
    //     for(const workSpace of this._workspaceFolders) {
    //         if (this._cacheManager.issuesCache != undefined) {
    //             this._workspaceToRoot.set(workSpace, this._cacheManager.issuesCache.get(workSpace));
    //         } else {
    //             this._workspaceToRoot.set(workSpace,undefined);
    //         }
    //     }
    // }

    private saveToCache(workSpace: vscode.WorkspaceFolder, node: IssuesRootTreeNode) {
        if (this._cacheManager.issuesCache) {
            this._cacheManager.issuesCache.store(workSpace, node);
        }
    }

    private async repopulateTree() {
        // TODO: check if update avaliable in connection, make it better
        const updatePromise: Promise<void> = this.update();
        this.clearTree();
        this.onChangeFire();
        await updatePromise;

        let workspaceScans: Promise<void>[] = [];
        for (const workspace of this._workspaceFolders) {
            workspaceScans.push(
                ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
                    await this.repopulateWorkspaceTree(workspace, progress, checkCanceled).finally(() => {
                        this.onChangeFire();
                    });
                }, 'Refresh ' + workspace.name + "'")
            );
        }
        await Promise.all(workspaceScans);
    }

    public test: number = 0;

    private async repopulateWorkspaceTree(
        workspace: vscode.WorkspaceFolder,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void
    ): Promise<IssuesRootTreeNode> {
        this.test = 0;
        // Initialize
        let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, 'scanning...');
        this._workspaceToRoot.set(workspace, root);
        const numberOfSteps: number = 2;
        let onProgress: () => void = () => {
            this.onChangeFire();
            checkCanceled();
        };
        let progressManager: StepProgress = new StepProgress(this,numberOfSteps,this._treesManager.logManager,progress, onProgress);
        // Step 1 - build dependency tree of the workspace
        progressManager.startStep('1/' + numberOfSteps + ':👷 Building dependency tree', 2);
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
            [workspace],
            this._treesManager.logManager
        );
        progressManager.report();
        let dependenciesTree: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', ''));
        await DependenciesTreesFactory.createDependenciesTrees(workspcaeDescriptors, [workspace], [], this._treesManager, dependenciesTree, false);
        progressManager.report();
        // Step 2 - Xray async scanning
        progressManager.startStep('2/' + numberOfSteps + ':🔎 Xray scanning', dependenciesTree.children.length + 1);
        let scansPromises: Promise<BaseFileTreeNode | undefined>[] = [];
        // Descriptors scanning
        for (let descriptorRoot of dependenciesTree.children) {
            if (descriptorRoot instanceof RootNode) {
                let descriptorName: string = this.getDescriptorName(descriptorRoot, workspcaeDescriptors);
                scansPromises.push(
                    this.createDescriptorScanningIssues(descriptorName, descriptorRoot, progressManager,checkCanceled)
                        .then(child => root.addChildAndApply(child))
                        .catch(error => this.onFileScanError(root,error, DescriptorTreeNode.createFailedScanNode(descriptorName)))
                        // TODO: fix when scan is finished with fail, add the leftover to the progress
                        .finally(() => onProgress())
                );
            }
        }
        // TODO: Zero-day scanning (source code)

        await Promise.all(scansPromises);
        // Update view and cache
        root.apply();
        root.title = Utils.getLastScanString(root.oldestScanTimestamp); // TODO: move into loading from cache, no need to show when scan just completed.
        this.onChangeFire();
        this.saveToCache(workspace, root);
        return root;
    }

    private onFileScanError(root: IssuesRootTreeNode, error: any, fileScanned?: BaseFileTreeNode): BaseFileTreeNode | undefined {
        if (error instanceof ScanCancellationError) {
            root.title = 'scan canceled';
            throw error;
        }
        if(fileScanned) {
            this._treesManager.logManager.logMessage("Scan on file '" + fileScanned.label + "' ended with error", 'ERR');
        }
        this._treesManager.logManager.logError(error, true);
        return root.addChildAndApply(fileScanned);
    }

    private async createDescriptorScanningIssues(
        descriptorName: string,
        descriptorRoot: RootNode,
        stepProgress: StepProgress,
        checkCanceled: () => void
    ): Promise<DescriptorTreeNode | undefined> {
        // Descriptor Not install - no need for scan
        if (descriptorRoot.label?.toString().includes('[Not installed]')) {
            return DescriptorTreeNode.createFailedScanNode(descriptorName);
        }
        // Scan descriptor
        let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptorName);
        let issuesCount: number = await this.scanDescriptor(
            descriptorNode,
            descriptorRoot,
            stepProgress.createScanProgress(descriptorRoot.generalInfo.artifactId),
            checkCanceled
        );
        // descriptorNode.apply();
        return issuesCount > 0 ? descriptorNode : undefined;
    }

    private async scanDescriptor(
        descriptorNode: DescriptorTreeNode,
        descriptor: RootNode,
        progress: XrayScanProgress,
        checkCanceled: () => void
    ): Promise<number> {
        // Dependency graph scanning
        let graphScanStratTime: number = Date.now();
        let graphResponse: IGraphResponse = await this._scanManager.scanDependencyGraph(progress, descriptor, checkCanceled);
        if (!graphResponse.vulnerabilities && !graphResponse.vulnerabilities) {
            this._treesManager.logManager.logMessage(
                "No issues found for descriptor '" + descriptor.generalInfo.artifactId + "' (elapsed=" + (Date.now() - graphScanStratTime) / 1000 + 'sec)',
                'DEBUG'
            );
            return 0;
        }
        this._treesManager.logManager.logMessage(
            "found '" +
                ((graphResponse.vulnerabilities ? graphResponse.vulnerabilities.length : 0) +
                    (graphResponse.violations ? graphResponse.violations.length : 0)) +
                "' vulnerabilities/violations for descriptor '" +
                descriptor.generalInfo.artifactId +
                "' (elapsed=" +
                (Date.now() - graphScanStratTime) / 1000 +
                'sec)',
            'DEBUG'
        );
        descriptorNode.dependencyScanTimeStamp = graphScanStratTime;
        let dependencyIssueCount: number = this.populateGraphScanResponse(descriptorNode, graphResponse);
        // TODO: applicability scan

        return dependencyIssueCount;
    }

    // private generateTreeChilds(impact_path: IImpactPath[], root: IImpactedPath) {

    // }

    // private toImpactedPathTree(impact_paths: IImpactPath[][]): IImpactedPath {
        
    //     let root: IImpactedPath | undefined;
    //     for(let i: number = 0; i < impact_paths.length; i++) {
    //         if(root == undefined) {
    //             root = {
    //                 name:
    //             }
    //         }
    //     }


    //     for(let i: number = 0; i < impact_paths.length; i++) {
    //         let current: IImpactedPath = root;
    //         let depth: number = 0;

    //         while(depth < impact_paths[i].length) {
    //             if (current.name == impact_paths[i][depth].component_id) {
    //                 current
    //                 depth++;
    //             }
    //         }

    //         for(let d: number = 0; d < impact_paths[i].length; i++) {

    //             current.children?.map(c => c.name).filter(c => c == impact_paths[i][d].component_id)
    //             if(current.name == impact_paths[i][d].component_id)
    //             current.name = impact_paths[i][d].component_id;
    //             // first one is always the same = descriptor
    //             if (d == 0) {
                    
    //             }
    //         }
    //     }
    //     for(let impactPath of impact_paths) {
    //     }
    //     return root;
    // }

    private populateGraphScanResponse(descriptorNode: DescriptorTreeNode, graphResponse: IGraphResponse): number {
        // TODO: remove saving files below
        // let scanPath: string = '/Users/assafa/Documents/testyWithTree' + Utils.getLastSegment(descriptor.generalInfo.artifactId) + '.json';
        // fs.writeFileSync(scanPath, JSON.stringify(graphResponse));
        let issues: IVulnerability[] = graphResponse.violations ? graphResponse.violations : graphResponse.vulnerabilities;
        let topSeverity: Severity = Severity.Unknown;
        // let issueDependencies: IssueDependencyTreeNode[] = [];

        // let issueDependencies:
        issues.forEach(issue => {
            let severity: Severity = SeverityUtils.getSeverity(issue.severity);
            if (severity > topSeverity) {
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
                        component.fixed_versions,
                        {} as IImpactedPath,//this.toImpactedPathTree(component.impact_paths, {} as IImpactedPath),
                        toPackgeType(component.package_type),
                        severity,
                        descriptorNode
                    );
                    descriptorNode.dependenciesWithIssue.push(dependencyWithIssue);
                } else if (severity > dependencyWithIssue.topSeverity) {
                    dependencyWithIssue.topSeverity = severity;
                }

                // Create issues for the dependency
                for (let cveIssue of issue.cves) {
                    if (!!cveIssue.cve) {
                        dependencyWithIssue.issues.push(new CveTreeNode(issue.issue_id, cveIssue.cve, severity, issue.edited, dependencyWithIssue));
                    } else {
                        dependencyWithIssue.issues.push(new CveTreeNode(issue.issue_id, issue.issue_id, severity, issue.edited, dependencyWithIssue));
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
        return descriptorNode.dependenciesWithIssue.length;
    }

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
        element?: /*TempRoot | ProjectRootTreeNode |*/ IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode //| CveTreeNode
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
        if (element instanceof IssueDependencyTreeNode) {
            return Promise.resolve(element.issues);
        }
        // TODO: Source code file type
    }

    getTreeItem(
        element: /*TempRoot | ProjectRootTreeNode |*/ IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode
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

    // public get issuesTreeView(): vscode.TreeView<IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode> {
    //     return this._issuesTreeView;
    // }

    // public set issuesTreeView(value: vscode.TreeView<IssuesRootTreeNode | BaseFileTreeNode | IssueDependencyTreeNode | CveTreeNode>) {
    //     this._issuesTreeView = value;
    // }

    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
