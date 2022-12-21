import * as vscode from 'vscode';
import { ScanManager } from '../../scanLogic/scanManager';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { XrayScanProgress } from 'jfrog-client-js';
import { IssuesRootTreeNode } from './issuesRootTreeNode';
import { FileTreeNode } from './fileTreeNode';
import { DescriptorTreeNode } from './descriptorTree/descriptorTreeNode';
import { DependencyIssuesTreeNode } from './descriptorTree/dependencyIssuesTreeNode';
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
import { IssueTreeNode } from './issueTreeNode';
import { LogManager } from '../../log/logManager';
import { LicenseIssueTreeNode } from './descriptorTree/licenseIssueTreeNode';

/**
 * Describes an error that occur during file scan.
 * When thrown a new FileTreeNode will be created for the parent the label of the node will be at the given format: {file_name} - {error.reason}
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
export class IssuesTreeDataProvider implements vscode.TreeDataProvider<IssuesRootTreeNode | FileTreeNode | IssueTreeNode | DependencyIssuesTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<
        IssuesRootTreeNode | FileTreeNode | IssueTreeNode | DependencyIssuesTreeNode | undefined
    > = new vscode.EventEmitter<IssuesRootTreeNode | FileTreeNode | IssueTreeNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<IssuesRootTreeNode | FileTreeNode | IssueTreeNode | DependencyIssuesTreeNode | undefined> = this
        ._onDidChangeTreeData.event;

    private _workspaceToRoot: Map<vscode.WorkspaceFolder, IssuesRootTreeNode | undefined> = new Map<vscode.WorkspaceFolder, IssuesRootTreeNode>();
    private _scanInProgress: boolean = false;

    constructor(
        protected _workspaceFolders: vscode.WorkspaceFolder[],
        protected _logManager: LogManager,
        private _scanManager: ScanManager,
        private _cacheManager: CacheManager,
        protected _treesManager: TreesManager
    ) {}

    /**
     * Refresh Command implementation (used for Refresh button).
     * Updates the workspace data with issues base on the given state of the workspace or load the last refresh from cache.
     * @param scan - If true (default), runs Xray scan, else get from cache the last old scan.
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
        this._logManager.showOutput();
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
                // Create a new async load task for each workspace
                workspaceLoads.push(
                    this.loadIssuesFromCache(workspace)
                        .then(root => {
                            if (root) {
                                this._workspaceToRoot.set(workspace, root);
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                                root.apply();
                            } else {
                                this._logManager.logMessage("WorkSpace '" + workspace.name + "' was never scanned", 'DEBUG');
                                this._workspaceToRoot.set(workspace, undefined);
                            }
                            this.onChangeFire();
                        })
                        .catch(async error => {
                            this._logManager.logError(error, true);
                            tempRoot.title = 'Loading error';
                            tempRoot.apply();
                            this.onChangeFire();
                            const answer: string | undefined = await vscode.window.showInformationMessage(
                                "Loading error occur on workspace '" + workspace.name + "', do you want to clear the old data?",
                                ...['Yes', 'No']
                            );
                            if (answer === 'Yes') {
                                this._workspaceToRoot.set(workspace, undefined);
                            }
                        })
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
                    let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptor.fullpath, root);
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
                    let shouldDeleteRoot: boolean = false;
                    let shouldCacheRoot: boolean = true;
                    // Exexute workspace scan task
                    await this.repopulateWorkspaceTree(workspaceData, root, progress, checkCanceled)
                        .then(() => {
                            this._logManager.logMessage("Workspace '" + workspace.name + "' scan ended", 'INFO');
                            shouldDeleteRoot = workspaceData.descriptorsIssuesData.length == 0 && workspaceData.failedFiles.length == 0;
                            root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                        })
                        .catch(error => {
                            if (error instanceof ScanCancellationError) {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task was canceled", 'INFO');
                                shouldDeleteRoot = workspaceData.descriptorsIssuesData.length == 0 && workspaceData.failedFiles.length == 0;
                                root.title = 'Scan canceled';
                            } else {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task ended with error:", 'ERR');
                                this._logManager.logError(error, true);
                                shouldCacheRoot = false;
                                root.title = 'Scan failed';
                            }
                        })
                        .finally(() => {
                            if (shouldDeleteRoot) {
                                this._workspaceToRoot.set(workspace, undefined);
                            } else {
                                root.apply();
                            }
                            this.onChangeFire();
                            if (shouldCacheRoot && this._cacheManager.issuesCache) {
                                this._cacheManager.issuesCache.store(workspace, workspaceData);
                            }
                        });
                }, "Refreshing workspace '" + workspace.name + "'")
            );
        }
        await Promise.all(workspaceScans);
    }

    // private async runApplic(workspace: string) {
    //     this._logManager.logMessage("<ASSAF> Starting Applicable scan: workspace = '" + workspace + "'", 'DEBUG');
    //     let startTime: number = Date.now();
    //     return this._scanManager
    //         .scanApplicability(workspace)
    //         .then(issues =>
    //             this._logManager.logMessage(
    //                 '<ASSAF> Applicable Issues found: ' +
    //                     (issues ? issues.length : 0) +
    //                     ' (elapsed: ' +
    //                     (Date.now() - startTime) / 1000 +
    //                     "sec): workspace = '" +
    //                     workspace +
    //                     "'",
    //                 'DEBUG'
    //             )
    //         );
    // }

    // private async runEos(workspace: string) {
    //     this._logManager.logMessage("<ASSAF> Starting Applicable scan: workspace = '" + workspace + "'",'DEBUG');
    //     let startTime:number = Date.now();
    //     return this._scanManager.scanApplicability(workspace).then(issues => this._logManager.logMessage("<ASSAF> Applicable Issues found: " + (issues ? issues.length : 0) + " (elapsed: " + ((Date.now() - startTime) / 1000) + "sec): workspace = '" + workspace + "'",'DEBUG'));
    // }

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
        let progressManager: StepProgress = new StepProgress(2, progress, this._logManager, () => {
            this.onChangeFire();
            checkCanceled();
        });
        let scansPromises: Promise<any>[] = [];

        // scansPromises.push(this.runApplic(workspaceData.path).catch(err => this._logManager.logError(err, true)));

        progressManager.startStep('👷 Building dependency tree', 2);
        let workspaceDependenciesTree: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', ''));
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await this.buildWorkspaceDependencyTree(
            root.workSpace,
            workspaceDependenciesTree,
            progressManager
        ).catch(error => {
            throw error;
        });

        progressManager.startStep('🔎 Xray scanning', workspaceDependenciesTree.children.length);

        // Descriptors scanning
        for (let descriptorGraph of workspaceDependenciesTree.children) {
            if (descriptorGraph instanceof RootNode) {
                const descriptorFullPath: string = DescriptorUtils.getDescriptorFullPath(descriptorGraph, workspcaeDescriptors);
                const descriptorData: DescriptorIssuesData = {
                    name: Utils.getLastSegment(descriptorFullPath),
                    fullpath: descriptorFullPath
                } as DescriptorIssuesData;
                scansPromises.push(
                    this.searchForDeescriptorIssues(descriptorData, descriptorGraph, progressManager, checkCanceled)
                        .then(descriptorWithIssues => {
                            if (descriptorWithIssues) {
                                // Add to data and update view
                                workspaceData.descriptorsIssuesData.push(descriptorData);
                                root.addChildAndApply(descriptorWithIssues);
                            }
                            return descriptorWithIssues;
                        })
                        .catch(error => this.onFileScanError(workspaceData, root, error, descriptorData))
                        .finally(() => progressManager.reportProgress(0))
                );
            }
        }
        // TODO: Add Eos scan

        await Promise.all(scansPromises);
        return root;
    }

    /**
     * Scan workspace for descriptors and build the dependency tree for each descriptor in the workspace.
     * populate the root arguments with the result, each child is the root of the descriptor graph
     * @param workSpace - the given workspace to craw in the file system to search for descriptors
     * @param root - the dependenciesTreeRoot that will be populated and will hold the final tree
     * @param progressManager - the progress manager for the workspace scanning process
     * @returns - map of all the descriptors in the workspace with the packeType of the descriptor as key and the file paths as values
     */
    public async buildWorkspaceDependencyTree(
        workSpace: vscode.WorkspaceFolder,
        root: DependenciesTreeNode,
        progressManager: StepProgress
    ): Promise<Map<PackageType, vscode.Uri[]>> {
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors([workSpace], this._logManager);
        progressManager.reportProgress();
        await DependenciesTreesFactory.createDependenciesTrees(workspcaeDescriptors, [workSpace], [], this._treesManager, root);
        // TODO: for multi pom maven project, add (clone) all sub poms as descriptors (root children) as well
        progressManager.reportProgress();

        return workspcaeDescriptors;
    }

    /**
     * Handle errors that occur.
     * 1.1 If error occur during file scan and failedFile provided a failed node will be created to notify the user.
     * 1.2 If the error is FileScanError the reason attribute will be added to the label
     * 2. If cancle is reported throw the error to handle on workspace level
     * @param workspaceData - the workspace that the file belongs to
     * @param root - the root that represents the workspace
     * @param error - the error that occur
     * @param failedFile - the file that was scanning during the error
     * @returns - failedFile argument for chaining
     */
    private onFileScanError(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        error: Error,
        failedFile?: FileIssuesData
    ): FileTreeNode | undefined {
        if (error instanceof ScanCancellationError || !failedFile) {
            throw error;
        }
        this._logManager.logMessage("Workspace '" + root.workSpace.name + "' scan on file '" + failedFile.fullpath + "' ended with error.", 'DEBUG');
        this._logManager.logError(error, true);

        workspaceData.failedFiles.push(failedFile);
        let failReason: string | undefined;
        if (error instanceof FileScanError) {
            failReason = error.reason;
            failedFile.name = error.reason;
        }
        return root.addChildAndApply(FileTreeNode.createFailedScanNode(failedFile.fullpath, failReason));
    }

    /**
     * Prepare and run Xray scanning for the given descriptor and populates the needed data and nodes.
     * If the descriptor had installed issues we don't need to scan it and pass it as failure
     * @param descriptorData - the issues data for the given descriptor to be populated
     * @param descriptorGraph - the dependency graph of the descriptor
     * @param stepProgress - the progress manager for the workspace scanning process
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     * @returns descriptorRoot argument if at least one issue was found for chaining or undentified otherwise.
     */
    private async searchForDeescriptorIssues(
        descriptorData: DescriptorIssuesData,
        descriptorGraph: RootNode,
        stepProgress: StepProgress,
        checkCanceled: () => void
    ): Promise<DescriptorTreeNode | undefined> {
        // Descriptor Not install - no need for scan
        if (descriptorGraph.label?.toString().includes('[Not installed]')) {
            stepProgress.reportProgress();
            throw new FileScanError('Descriptor ' + descriptorData.fullpath + ' is not installed', '[Not installed]');
        }
        let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptorData.fullpath);
        // Scan descriptor
        this._logManager.logMessage('Scanning descriptor ' + descriptorData.fullpath + ' for issues', 'INFO');
        let startGraphScan: number = Date.now();
        let issuesCount: number = await this.scanDescriptor(descriptorNode, descriptorData, descriptorGraph, stepProgress, checkCanceled);
        if (issuesCount > 0) {
            this._logManager.logMessage(
                'Found ' +
                    issuesCount +
                    ' issues for descriptor ' +
                    descriptorData.fullpath +
                    ' (elapsed=' +
                    (descriptorData.graphScanTimestamp - startGraphScan) / 1000 +
                    'sec)',
                'INFO'
            );
            return descriptorNode;
        } else {
            this._logManager.logMessage(
                'No issues found for descriptor ' +
                    descriptorData.fullpath +
                    ' (elapsed=' +
                    (descriptorData.graphScanTimestamp - startGraphScan) / 1000 +
                    'sec)',
                'INFO'
            );
            return undefined;
        }
    }

    /**
     * Run Xray scanning for a single descriptor and populates the data and view
     * @param descriptorNode - the node that represents the descriptor in view
     * @param descriptorData - the issues data for the given descriptor
     * @param descriptorGraph - the dependency graph of the descriptor
     * @param progress - the progress manager for the workspace scanning process
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     * @returns the number of issues that the Xray scanning found for the given descriptor
     */
    private async scanDescriptor(
        descriptorNode: DescriptorTreeNode,
        descriptorData: DescriptorIssuesData,
        descriptorGraph: RootNode,
        stepProgress: StepProgress,
        checkCanceled: () => void
    ): Promise<number> {
        // Dependency graph scanning
        let scanProgress: XrayScanProgress = stepProgress.createScanProgress(descriptorData.fullpath);
        descriptorData.dependenciesGraphScan = await this._scanManager
            .scanDependencyGraph(scanProgress, descriptorGraph, checkCanceled)
            .finally(() => {
                scanProgress.setPercentage(100);
                descriptorData.graphScanTimestamp = Date.now();
            });
        if (!descriptorData.dependenciesGraphScan.vulnerabilities && !descriptorData.dependenciesGraphScan.violations) {
            return 0;
        }
        descriptorData.impactTreeData = Object.fromEntries(
            // TODO: fix impacted path for demo/package.json, CVE-2022-24999. should be 4 childs (3 qs with diff ver and express) but there are only 2 qs (6.7.0 not found)
            DescriptorUtils.createImpactedPaths(descriptorGraph, descriptorData.dependenciesGraphScan).entries()
        );
        // TODO: applicability scan for the descriptor

        return DescriptorUtils.populateDescriptorData(descriptorNode, descriptorData);
    }

    /**
     * Search for file with issues and return the tree node that matches the path.
     * Values return base on the last call to Refresh
     * @param filePath - file path to search if issues exists for it
     * @returns - the file tree node if exists issues for it, undefined otherwise
     */
    public getFileIssuesTree(filePath: string): FileTreeNode | undefined {
        for (let [workspace, issuesRoot] of this._workspaceToRoot) {
            if (filePath.includes(workspace.uri.fsPath)) {
                return issuesRoot?.children.find(file => file.fullPath == filePath);
            }
        }
        return undefined;
    }

    /**
     * Search for descriptor issues data base on a given full path to the descriptor
     * @param filePath - the full path to the descriptor
     * @returns - the descriptor issues data if exists issues for the descriptor, undefined otherwise
     */
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

    getChildren(element?: IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode): vscode.ProviderResult<any> {
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
        // TODO: Eos file type
    }

    getTreeItem(element: IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode | IssueTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        // Descriptor file type
        if (element instanceof FileTreeNode) {
            element.command = Utils.createNodeCommand('jfrog.xray.file.open', 'Open File', [element.fullPath]);
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
        }
        if (element instanceof DependencyIssuesTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.topSeverity !== undefined ? element.topSeverity : Severity.Unknown);
            return element;
        }
        if (element instanceof CveTreeNode || element instanceof LicenseIssueTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
            element.command = Utils.createNodeCommand('view.dependency.details.page', 'Show details', [element.getDetailsPage()]);
            return element;
        }
        // TODO: Eos file type

        return element;
    }

    public getParent(element: FileTreeNode): Thenable<IssuesRootTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    /**
     * Refresh the view to the current nodes in _workspaceToRoot
     */
    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
