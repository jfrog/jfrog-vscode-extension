import * as vscode from 'vscode';

import { ScanManager } from '../../scanLogic/scanManager';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { XrayScanProgress } from 'jfrog-client-js';

import { IssuesRootTreeNode } from './issuesRootTreeNode';
import { FileTreeNode } from './fileTreeNode';
import { DescriptorTreeNode } from './descriptorTree/descriptorTreeNode';
import { DependencyIssuesTreeNode } from './descriptorTree/dependencyIssueTreeNode';
import { CveTreeNode } from './descriptorTree/cveTreeNode';

import { DependenciesTreesFactory } from '../dependenciesTree/dependenciesTreeFactory';
import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';
import { DependenciesTreeNode } from '../dependenciesTree/dependenciesTreeNode';

import { CacheManager } from '../../cache/cacheManager';
import { DescriptorIssuesData, FileIssuesData, WorkspaceIssuesData } from '../../cache/issuesCache';

import { PackageType } from '../../types/projectType';
import { GeneralInfo } from '../../types/generalInfo';
import { Severity, SeverityUtils } from '../../types/severity';
import { StepProgress } from '../utils/stepProgress';
import { Utils } from '../utils/utils';
import { DescriptorUtils } from '../utils/descriptorUtils';

import { TreesManager } from '../treesManager';
import { IssueTreeNode as IssueTreeLeaf } from './issueTreeNode';
import { LogManager } from '../../log/logManager';

/**
 * Describes an error that occur during file scan, when thrown a new FileTreeNode will be created for the parent
 * the label of the node will be at the given format: {file_name} - {error.reason}
 */
export class FileScanError extends Error {
    constructor(msg: string, public reason: string) {
        super(msg);
    }
}

/**
 * Describes Xray issues data provider for the 'Issues' tree view and provides API to get issues data for files.
 * 'Issues' view tree structure is as following:
 *  - IssuesRootTreeNode (the root of the tree, describes all the issues in a workspace)
 *  - - <? extends FileTreeNode> (describes any file that belongs to the workspace and has issues)
 *  - - ... - <? extends IssueTreeNode> (the leaf of the tree, describes any type of issue in a file)
 */
export class IssuesTreeDataProvider implements vscode.TreeDataProvider<IssuesRootTreeNode | FileTreeNode | IssueTreeLeaf> {
    private _onDidChangeTreeData: vscode.EventEmitter<IssuesRootTreeNode | FileTreeNode | IssueTreeLeaf | undefined> = new vscode.EventEmitter<
        IssuesRootTreeNode | FileTreeNode | IssueTreeLeaf | undefined
    >();
    readonly onDidChangeTreeData: vscode.Event<IssuesRootTreeNode | FileTreeNode | IssueTreeLeaf | undefined> = this._onDidChangeTreeData.event;

    private _workspaceToRoot: Map<vscode.WorkspaceFolder, IssuesRootTreeNode | undefined> = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();
    private _scanInProgress: boolean = false;

    constructor(
        protected _workspaceFolders: vscode.WorkspaceFolder[],
        protected _logManager: LogManager,
        private _scanManager: ScanManager,
        private _cacheManager: CacheManager,
        protected _treesManager: TreesManager // TODO: to be deleted in future
    ) {}

    /**
     * Refresh Command implementation (used for Refresh button).
     * Updates the workspace data with issues base on the given state of the workspace or load the last refresh from cache.
     * @param scan - if true (default), runs Xray scan, else get from cache the last old scan.
     */
    public async refresh(scan: boolean = true) {
        if (!(await this._treesManager.connectionManager.isSignedIn())) {
            this._logManager.logMessage('Refresh: user is not signed in', 'DEBUG');
            this.clearTree();
            return;
        }
        if (!scan) {
            this._logManager.logMessage('Refresh: loading data from cache', 'INFO');
            this.loadFromCache();
            return;
        }
        if (this._scanInProgress) {
            vscode.window.showInformationMessage('Previous scan still running...');
            return;
        }

        this._logManager.logMessage('Refresh: starting Xray scans', 'INFO');
        this._scanInProgress = true;
        ScanUtils.setScanInProgress(true);
        this._workspaceToRoot = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();
        const startRefreshTimestamp: number = Date.now();
        this.scanWorkspaces()
            .catch(error => this._logManager.logError(error, true))
            .finally(() => {
                this._scanInProgress = false;
                ScanUtils.setScanInProgress(false);
                this.onChangeFire();
                this._logManager.logMessage('Xray scans completed 🐸 (elapsed = ' + (Date.now() - startRefreshTimestamp) / 1000 + 'sec)', 'INFO');
            });
    }

    /**
     * Clear all the data in the tree view.
     */
    public clearTree() {
        this._workspaceToRoot = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();
        this.onChangeFire();
    }

    /**
     * Loads the issues from the last scan of all the workspaces if they exist.
     */
    public async loadFromCache() {
        if (this._cacheManager.issuesCache) {
            let workspaceLoads: Promise<void>[] = [];
            for (const workspace of this._workspaceFolders) {
                // Create dummy root to give input to the user while waiting for the workspace loading task or when error occur
                const tempRoot: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, 'Loading...');
                this._workspaceToRoot.set(workspace, tempRoot);
                // Create a new async scan task for each workspace
                workspaceLoads.push(
                    this.loadIssuesFromCache(workspace)
                        .then(root => {
                            if (root) {
                                this._workspaceToRoot.set(workspace, root);
                                root.apply();
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                            } else {
                                this._logManager.logMessage("WorkSpace '" + workspace.name + "' was never scanned", 'DEBUG');
                                this._workspaceToRoot.set(workspace, undefined);
                            }
                        })
                        .catch(error => {
                            this._logManager.logMessage("Workspace '" + workspace.name + "' loading task ended with error:", 'DEBUG');
                            this._logManager.logError(error, true);
                            tempRoot.title = 'Loading error';
                        })
                        .finally(() => this.onChangeFire())
                );
            }
            await Promise.all(workspaceLoads);
        }
    }

    /**
     * Async task to load the issues from the last scan of a given workspace
     * @param workSpace - the workspace to load it's issues
     * @returns - the workspcae issues if the exists, undefined otherwise
     */
    private async loadIssuesFromCache(workSpace: vscode.WorkspaceFolder): Promise<IssuesRootTreeNode | undefined> {
        // Check if data for the workspace exists in the cache
        let workspaceData: WorkspaceIssuesData | undefined = this._cacheManager.issuesCache?.get(workSpace);
        if (workspaceData != undefined) {
            this._logManager.logMessage("Loading issues from last scan for workSpace '" + workSpace.name + "'", 'INFO');
            let root: IssuesRootTreeNode = new IssuesRootTreeNode(workSpace);
            if (workspaceData.failedFiles) {
                // Load files that had error on the last scan and create tree node in the root
                workspaceData.failedFiles.forEach(file => {
                    this._logManager.logMessage("Loading file with scan error '" + file.name + "': '" + file.fullpath + "'", 'DEBUG');
                    let failed: FileTreeNode = FileTreeNode.createFailedScanNode(file.fullpath, file.name);
                    return root.children.push(failed);
                });
            }
            if (workspaceData.descriptorsIssuesData) {
                // Load descriptors issues and create tree node in the root
                workspaceData.descriptorsIssuesData.forEach(descriptor => {
                    this._logManager.logMessage("Loading issues of descriptor '" + descriptor.fullpath + "'", 'DEBUG');
                    let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptor.name, root);
                    DescriptorUtils.populateDescriptorData(descriptorNode, descriptor);
                    root.children.push(descriptorNode);
                });
            }
            return root;
        }
        return undefined;
    }

    /**
     * Run Xray scans on all the active workspaces async for each workspace
     */
    private async scanWorkspaces() {
        let workspaceScans: Promise<void>[] = [];
        for (const workspace of this._workspaceFolders) {
            workspaceScans.push(
                ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
                    // Create workspace scan data that will be populated at the scan and will be saved to the cache
                    let workspaceData: WorkspaceIssuesData = {
                        path: workspace.uri.fsPath,
                        descriptorsIssuesData: [],
                        failedFiles: []
                    } as WorkspaceIssuesData;
                    // Create workspace tree root node to give feedback and update the user on any change while handling the async scan task
                    let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, 'Scanning...');
                    this._workspaceToRoot.set(workspace, root);
                    // Exexute workspace scan task
                    await this.repopulateWorkspaceTree(workspaceData, root, progress, checkCanceled)
                        .then(() => {
                            this._logManager.logMessage("Workspace '" + workspace.name + "' scan ended", 'INFO');
                            root.apply();
                            root.title = Utils.getLastScanString(root.oldestScanTimestamp); // TODO: maybe replace to ""?, no need to show when scan just completed?
                        })
                        .catch(error => {
                            if (error instanceof ScanCancellationError) {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task was canceled", 'INFO');
                                root.title = 'Scan canceled';
                            } else {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task ended with error:", 'DEBUG');
                                this._logManager.logError(error, true);
                                root.title = 'Scan failed';
                            }
                        })
                        .finally(() => {
                            if (workspaceData.descriptorsIssuesData.length == 0 && workspaceData.failedFiles.length == 0) {
                                this._workspaceToRoot.set(workspace, undefined);
                            } else if (this._cacheManager.issuesCache) {
                                this._cacheManager.issuesCache.store(workspace, workspaceData);
                            }
                            this.onChangeFire();
                        });
                }, "Refreshing workspace '" + workspace.name + "'")
            );
        }
        await Promise.all(workspaceScans);
    }

    /**
     * Execute async scan task for the given workspace and populate the issues from the scan to the data and to the tree
     * Step 1: Build dependency tree step with two substeps (get the workspace descriptors and then build the tree for each of them)
     * Step 2: Run Xray scans for files in the workspace, async
     * @param workspaceData - the given object that holds all the issues data for the workspace and will be populated at the task
     * @param root - the given tree root for the workspace, the nodes that the user will see at the issues view
     * @param progress - the progress notification window for the given task
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     * @returns root argument for chaining
     */
    private async repopulateWorkspaceTree(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void
    ): Promise<IssuesRootTreeNode> {
        // Initialize task
        const numberOfSteps: number = 2;
        let onProgress: () => void = () => {
            this.onChangeFire();
            checkCanceled();
        };
        let progressManager: StepProgress = new StepProgress(root, numberOfSteps, this._logManager, progress, onProgress); // TODO: finish manager

        progressManager.startStep('👷 Building dependency tree', 2);
        let workspaceDependenciesTree: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', ''));
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await this.buildWorkspaceDependencyTree(
            root.workSpace,
            workspaceDependenciesTree,
            progressManager
        );

        progressManager.startStep('🔎 Xray scanning', workspaceDependenciesTree.children.length);
        let scansPromises: Promise<FileTreeNode | undefined>[] = [];
        // Descriptors scanning
        for (let descriptorRoot of workspaceDependenciesTree.children) {
            if (descriptorRoot instanceof RootNode) {
                const descriptorFullPath: string = DescriptorUtils.getDescriptorFullPath(descriptorRoot, workspcaeDescriptors);
                const descriptorData: DescriptorIssuesData = {
                    name: Utils.getLastSegment(descriptorFullPath),
                    fullpath: descriptorFullPath
                } as DescriptorIssuesData;
                scansPromises.push(
                    this.searchForDeescriptorIssues(descriptorData, descriptorRoot, progressManager, checkCanceled)
                        .then(descriptorWithIssues => {
                            if (descriptorWithIssues) {
                                // Add to data and update view
                                workspaceData.descriptorsIssuesData.push(descriptorData);
                                root.addChildAndApply(descriptorWithIssues);
                            }
                            return descriptorWithIssues;
                        })
                        .catch(error => this.onFileScanError(workspaceData, root, error, descriptorData))
                        .finally(() => onProgress())
                );
            }
        }
        // TODO: Add Eos scan

        await Promise.all(scansPromises);
        return root;
    }

    /**
     * Build the dependency tree for each descriptor in the workspace.
     * @param workSpace - the given workspace to craw in the file system to search for descriptors
     * @param root - the dependenciesTreeRoot that will be populated and will hold the final tree
     * @param progressManager - the progress manager for the scan task to report progress while executing
     * @returns - map of all the descriptors in the workspace with the packeType of the descriptor as key and the file paths as values
     */
    public async buildWorkspaceDependencyTree(
        workSpace: vscode.WorkspaceFolder,
        root: DependenciesTreeNode,
        progressManager: StepProgress
    ): Promise<Map<PackageType, vscode.Uri[]>> {
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors([workSpace], this._logManager);
        progressManager.reportProgress();

        await DependenciesTreesFactory.createDependenciesTrees(workspcaeDescriptors, [workSpace], [], this._treesManager, root, false);
        progressManager.reportProgress();

        return workspcaeDescriptors;
    }

    private onFileScanError(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        error: Error,
        failedFile?: FileIssuesData
    ): FileTreeNode | undefined {
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
        return root.addChildAndApply(FileTreeNode.createFailedScanNode(failedFile.fullpath, failReason));
    }

    private async searchForDeescriptorIssues(
        descriptorData: DescriptorIssuesData,
        descriptorRoot: RootNode,
        stepProgress: StepProgress,
        checkCanceled: () => void
    ): Promise<DescriptorTreeNode | undefined> {
        // Descriptor Not install - no need for scan
        if (descriptorRoot.label?.toString().includes('[Not installed]')) {
            stepProgress.reportProgress();
            throw new FileScanError("Descriptor '" + descriptorData.fullpath + "' is not installed", '[Not installed]');
        }
        // Scan descriptor
        let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptorData.fullpath);
        let scanProgress: XrayScanProgress = stepProgress.createScanProgress(descriptorRoot.generalInfo.artifactId);
        this._treesManager.logManager.logMessage("Scanning descriptor '" + descriptorData.fullpath + "' for issues", 'DEBUG');
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
            DescriptorUtils.createImpactedPaths(descriptorGraph, descriptorData.dependenciesGraphScan).entries()
        );
        // TODO: applicability scan for the descriptor

        return DescriptorUtils.populateDescriptorData(descriptorNode, descriptorData);
    }

    public getFileIssuesTree(filePath: string): FileTreeNode | undefined {
        for (let [workspace, issuesRoot] of this._workspaceToRoot) {
            if (filePath.includes(workspace.uri.fsPath)) {
                return issuesRoot?.children.find(file => file.fullPath == filePath);
            }
        }
        return undefined;
    }

    public getDescriptorIssuesData(filePath: string): DescriptorIssuesData | undefined {
        for (const workspace of this._workspaceToRoot.keys()) {
            if (filePath.includes(workspace.uri.fsPath)) {
                let workspaceIssueData: WorkspaceIssuesData | undefined = this._cacheManager.issuesCache?.get(workspace);
                if (workspaceIssueData) {
                    return workspaceIssueData.descriptorsIssuesData.find(descriptor => descriptor.fullpath == filePath);
                }
            }
        }
        return undefined;
    }

    // Structure of the tree
    getChildren(
        element?: /*TempRoot | ProjectRootTreeNode |*/ IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode //| CveTreeNode
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
        if (element instanceof DependencyIssuesTreeNode) {
            return Promise.resolve(element.issues);
        }
        // TODO: Zero-day file type
    }

    getTreeItem(
        element: /*TempRoot | ProjectRootTreeNode |*/ IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode | CveTreeNode
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        // TODO: Root
        // if (element instanceof ProjectRootTreeNode) {
        //     // element.iconPath = PackageDescriptorUtils.getIcon(element.details.type);
        //     // element.command = Utils.createNodeCommand('jfrog.xray.focus', '', [element.details.path]);
        //     return element;
        // }

        // Descriptor file type
        if (element instanceof FileTreeNode) {
            element.command = Utils.createNodeCommand('jfrog.xray.file.open', 'Open File', [element]);
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
        }
        if (element instanceof DependencyIssuesTreeNode) {
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

    public getParent(element: FileTreeNode): Thenable<IssuesRootTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
