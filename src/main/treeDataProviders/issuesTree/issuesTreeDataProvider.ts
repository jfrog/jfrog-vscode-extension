import * as vscode from 'vscode';
import * as path from 'path';
import { ScanManager } from '../../scanLogic/scanManager';
import { FileScanError, ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
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
import { getNumberOfSupportedPackageTypes, PackageType } from '../../types/projectType';
import { Severity, SeverityUtils } from '../../types/severity';
import { StepProgress } from '../utils/stepProgress';
import { Utils } from '../utils/utils';
import { DescriptorUtils } from '../utils/descriptorUtils';
import { TreesManager } from '../treesManager';
import { IssueTreeNode } from './issueTreeNode';
import { LogManager } from '../../log/logManager';
import { LicenseIssueTreeNode } from './descriptorTree/licenseIssueTreeNode';
import { AnalyzerUtils } from '../utils/analyzerUtils';
import { CodeIssueTreeNode } from './codeFileTree/codeIssueTreeNode';
import { CodeFileTreeNode } from './codeFileTree/codeFileTreeNode';
import { ApplicableTreeNode } from './codeFileTree/applicableTreeNode';
import { DescriptorIssuesData, FileIssuesData, WorkspaceIssuesData } from '../../types/issuesData';
import { EosTreeNode } from './codeFileTree/eosTreeNode';
import { NotEntitledError } from '../../scanLogic/scanRunners/binaryRunner';

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
    public async refresh(scan: boolean = true): Promise<void> {
        if (!(await this._treesManager.connectionManager.isSignedIn())) {
            this._logManager.logMessage('Refresh: user is not signed in', 'INFO');
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
        this.clearTree();
        this._logManager.showOutput();
        this._logManager.logMessage('Refresh: starting workspace scans 🐸', 'INFO');
        this._scanInProgress = true;
        ScanUtils.setScanInProgress(true);
        ScanUtils.setFirstScanForWorkspace(false);
        const startRefreshTimestamp: number = Date.now();
        await this.scanWorkspaces()
            .catch(error => this._logManager.logError(error, true))
            .finally(() => {
                this._scanInProgress = false;
                ScanUtils.setScanInProgress(false);
                this.onChangeFire();
            });
        this._logManager.logMessage('Scans completed 🐸 (elapsed ' + (Date.now() - startRefreshTimestamp) / 1000 + ' seconds)', 'INFO');
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
            let firstTime: boolean = true;
            for (const workspace of this._workspaceFolders) {
                // Create dummy root to give input to the user while waiting for the workspace loading task or when error occur
                const tempRoot: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, 'Loading...');
                this._workspaceToRoot.set(workspace, tempRoot);
                this.onChangeFire();
                // Create a new async load task for each workspace
                workspaceLoads.push(
                    this.loadIssuesFromCache(workspace)
                        .then(root => {
                            if (root && root.children.length > 0) {
                                this._workspaceToRoot.set(workspace, root);
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                                root.apply();
                            } else {
                                this._logManager.logMessage("WorkSpace '" + workspace.name + "' has no data in cache", 'DEBUG');
                                this._workspaceToRoot.set(workspace, undefined);
                            }
                            firstTime = !root;
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
            ScanUtils.setFirstScanForWorkspace(firstTime);
            this.onChangeFire();
        }
    }

    /**
     * Async task to load the issues from the last scan of a given workspace
     * @param workSpace - the workspace to load it's issues
     * @returns - the workspace issues if the exists, undefined otherwise
     */
    private async loadIssuesFromCache(workSpace: vscode.WorkspaceFolder): Promise<IssuesRootTreeNode | undefined> {
        // Check if data for the workspace exists in the cache
        let workspaceData: WorkspaceIssuesData | undefined = this._cacheManager.issuesCache?.get(workSpace);
        if (workspaceData != undefined) {
            this._logManager.logMessage("Loading issues from last scan for the workspace '" + workSpace.name + "'", 'INFO');
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
                    let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptor.fullpath, descriptor.type, root);
                    DescriptorUtils.populateDescriptorData(descriptorNode, descriptor);
                    if (descriptor.applicableIssues && descriptor.applicableIssues.scannedCve) {
                        AnalyzerUtils.populateApplicableIssues(root, descriptorNode, descriptor);
                    }
                    root.children.push(descriptorNode);
                });
            }
            if (workspaceData.eosScan) {
                root.eosScanTimeStamp = workspaceData.eosScanTimestamp;
                AnalyzerUtils.populateEosIssues(root, workspaceData);
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
                    const workspaceData: WorkspaceIssuesData = new WorkspaceIssuesData(workspace.uri.fsPath);
                    // Create workspace tree root node to give feedback and update the user on any change while handling the async scan task
                    let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, '🔎 Scanning...');
                    this._workspaceToRoot.set(workspace, root);
                    let shouldDeleteRoot: boolean = false;
                    // Execute workspace scan task
                    await this.repopulateWorkspaceTree(workspaceData, root, progress, checkCanceled)
                        .then(() => {
                            this._logManager.logMessage("Workspace '" + workspace.name + "' scan ended", 'INFO');
                            shouldDeleteRoot = !workspaceData.hasInformation();
                            if (workspaceData.failedFiles.length > 0) {
                                root.title = 'Scan failed';
                            } else {
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                            }
                        })
                        .catch(error => {
                            if (error instanceof ScanCancellationError) {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task was canceled", 'INFO');
                                shouldDeleteRoot = !workspaceData.hasInformation();
                                root.title = 'Scan canceled';
                            } else {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task ended with error:", 'ERR');
                                this._logManager.logError(error, true);
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
                            if (this._cacheManager.issuesCache) {
                                this._cacheManager.issuesCache.store(workspace, workspaceData);
                            }
                        });
                }, "Refreshing workspace '" + workspace.name + "'")
            );
        }
        await Promise.all(workspaceScans);
        this.onChangeFire();
    }

    /**
     * Execute async scan task for the given workspace and populate the issues from the scan to the data and to the tree
     * Step 1: Build dependency tree step with two substeps (get the workspace descriptors and then build the tree for each of them)
     * Step 2: Run security scans on files in the workspace, async
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
        let progressManager: StepProgress = new StepProgress(
            progress,
            () => {
                this.onChangeFire();
                checkCanceled();
            },
            2,
            this._logManager
        );
        // Scan workspace to prepare the needed information for the scans and progress
        progress.report({ message: '👷 Preparing workspace' });
        let workspaceDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors([root.workSpace], this._logManager);
        let descriptorsCount: number = 0;
        for (let descriptorPaths of workspaceDescriptors.values()) {
            descriptorsCount += descriptorPaths.length;
        }
        checkCanceled();
        let graphSupported: boolean = await this._scanManager.validateGraphSupported();
        checkCanceled();

        // Build workspace dependency tree for all the descriptors
        progressManager.startStep('👷 Building workspace dependencies tree', getNumberOfSupportedPackageTypes());
        let workspaceDependenciesTree: DependenciesTreeNode = await DependenciesTreesFactory.createDependenciesTrees(
            workspaceDescriptors,
            [root.workSpace],
            [],
            this._treesManager,
            progressManager,
            checkCanceled
        );

        progressManager.startStep('🔎 Scanning for issues', graphSupported ? 2 * descriptorsCount + 1 : 1);
        let scansPromises: Promise<any>[] = [];
        scansPromises.push(AnalyzerUtils.runEos(workspaceData, root, workspaceDescriptors, this._scanManager, progressManager));
        // Dependency graph scan and applicability scan for each descriptor
        if (graphSupported) {
            scansPromises.push(
                this.descriptorsScanning(workspaceData, root, workspaceDescriptors, workspaceDependenciesTree, progressManager, checkCanceled)
            );
        }
        await Promise.all(scansPromises);
        return root;
    }

    /**
     * Preform security scanning for all the descriptors in the workspace in two substeps:
     * 1. Dependency graph scan to discover CVE issues
     * 2. Applicability scan of the CVE in the workspace
     * @param workspaceData - the given object that holds all the issues data for the workspace and will be populated at the task
     * @param root - the dependenciesTreeRoot that will be populated and will hold the final tree
     * @param workspaceDescriptors - map of all the descriptors in the workspace with the packageType of the descriptor as key and the file paths as values
     * @param workspaceDependenciesTree - the dependencies graph of all the descriptors in the workspace (each child of root is a descriptor graph)
     * @param progressManager - the progress manager for the workspace scanning process
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     */
    private async descriptorsScanning(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        workspaceDescriptors: Map<PackageType, vscode.Uri[]>,
        workspaceDependenciesTree: DependenciesTreeNode,
        progressManager: StepProgress,
        checkCanceled: () => void
    ): Promise<any> {
        // 2. Scan descriptors
        let scansPromises: Promise<any>[] = [];
        for (const [type, descriptorsPaths] of workspaceDescriptors) {
            for (const descriptorPath of descriptorsPaths) {
                const descriptorData: DescriptorIssuesData = {
                    type: type,
                    name: Utils.getLastSegment(descriptorPath.fsPath),
                    fullpath: descriptorPath.fsPath
                } as DescriptorIssuesData;

                let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptorData.fullpath, descriptorData.type);
                // Search for the dependency graph of the descriptor
                let descriptorGraph: RootNode | undefined = DescriptorUtils.getDependencyGraph(workspaceDependenciesTree, descriptorPath.fsPath);
                if (!descriptorGraph) {
                    progressManager.reportProgress(2 * progressManager.getStepIncValue);
                    this._logManager.logMessage("Can't find descriptor graph for " + descriptorPath.fsPath, 'DEBUG');
                    continue;
                }
                // Project is not installed - Go, npm, Yarn v1, or Python
                if (descriptorGraph?.label?.toString().includes('[Not installed]')) {
                    progressManager.reportProgress(2 * progressManager.getStepIncValue);
                    this.onFileScanError(
                        workspaceData,
                        root,
                        new FileScanError('Project with descriptor file ' + descriptorPath.fsPath + ' is not installed', '[Project not installed]'),
                        descriptorData
                    );
                    continue;
                }
                // Project is not supported - Yarn v2+
                if (descriptorGraph?.label?.toString().includes('[Not supported]')) {
                    progressManager.reportProgress(2 * progressManager.getStepIncValue);
                    this.onFileScanError(
                        workspaceData,
                        root,
                        new FileScanError('Project with descriptor file ' + descriptorPath.fsPath + ' is not supported', '[Not supported]'),
                        descriptorData
                    );
                    continue;
                }
                // Scan the descriptor
                scansPromises.push(
                    this.createDescriptorTask(workspaceData, root, descriptorData, descriptorNode, descriptorGraph, progressManager, checkCanceled)
                );
            }
        }
        await Promise.all(scansPromises);
    }

    /**
     * Runs the descriptor scans asynchronously.
     * 1. Dependency graph scanning
     * 2. CVE Applicability scanning
     * @param workspaceData - the issues data for the workspace
     * @param root - the root node of the workspace
     * @param descriptorData - the descriptor issues data
     * @param descriptorNode - the descriptor node
     * @param descriptorGraph - the descriptor dependencies graph
     * @param progressManager - the progress manager for the process
     * @param checkCanceled - the method to check if cancel was requested
     */
    private async createDescriptorTask(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        descriptorData: DescriptorIssuesData,
        descriptorNode: DescriptorTreeNode,
        descriptorGraph: RootNode,
        progressManager: StepProgress,
        checkCanceled: () => void
    ): Promise<void> {
        let foundIssues: boolean = false;
        // Dependency graph scan task
        await this.scanDescriptorGraph(descriptorData, descriptorNode, descriptorGraph, progressManager, checkCanceled)
            .then(descriptorWithIssues => {
                if (descriptorWithIssues) {
                    // Add to data and update view
                    workspaceData.descriptorsIssuesData.push(descriptorData);
                    root.addChildAndApply(descriptorWithIssues);
                    foundIssues = true;
                }
            })
            .catch(error => this.onFileScanError(workspaceData, root, error, descriptorData))
            .finally(() => progressManager.onProgress());
        // Applicable scan task
        if (!this._scanManager.validateApplicableSupported() || !foundIssues) {
            progressManager.reportProgress();
            return;
        }
        await this.cveApplicableScanning(root, descriptorData, descriptorNode, progressManager.abortController)
            .catch(err => this.onScanError(err))
            .finally(() => progressManager.reportProgress());
    }

    /**
     * Handle errors that occur during workspace scan, and checks if cancellation was requested.
     * @param error - the error occurred
     * @param handle - if true the error will be logged and not thrown/returned.
     * @returns -  undefined if the error was handled or an error otherwise
     */
    private onScanError(error: Error, handle: boolean = true, log: boolean = false): Error | undefined {
        if (error instanceof ScanCancellationError) {
            throw error;
        }
        if (error instanceof NotEntitledError) {
            this._logManager.logMessage(error.message, 'INFO');
        }
        if (log) {
            this._logManager.logError(error, true);
        }
        return handle ? undefined : error;
    }

    /**
     * Handle errors that occur when scanning a specific file.
     * 1.1 If error occur during file scan and failedFile provided a failed node will be created to notify the user.
     * 1.2 If the error is FileScanError the reason attribute will be added to the label
     * 2. If cancel is reported throw the error to handle on workspace level
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
        let err: Error | undefined = this.onScanError(error, false);
        if (err) {
            if (failedFile) {
                this._logManager.logMessage(
                    "Workspace '" + root.workSpace.name + "' scan on file '" + failedFile.fullpath + "' ended with error:\n" + err,
                    'ERR'
                );
                workspaceData.failedFiles.push(failedFile);
                let failReason: string | undefined;
                if (error instanceof FileScanError) {
                    failReason = error.reason;
                } else {
                    failReason = '[Fail to scan]';
                }
                failedFile.name = failReason;
                return root.addChildAndApply(FileTreeNode.createFailedScanNode(failedFile.fullpath, failReason));
            }
            throw err;
        }
        return undefined;
    }

    /**
     * Runs Xray scanning for a single descriptor and populates the data and view
     * @param descriptorData - the issues data for the given descriptor
     * @param descriptorNode - the node that represents the descriptor in view
     * @param descriptorGraph - the dependency graph of the descriptor
     * @param progressManager - the progress manager for the workspace scanning process
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     * @returns the number of issues that the Xray scanning found for the given descriptor
     */
    private async scanDescriptorGraph(
        descriptorData: DescriptorIssuesData,
        descriptorNode: DescriptorTreeNode,
        descriptorGraph: RootNode,
        progressManager: StepProgress,
        checkCanceled: () => void
    ): Promise<DescriptorTreeNode | undefined> {
        this._logManager.logMessage('Scanning descriptor ' + descriptorData.fullpath + ' for dependencies issues', 'INFO');
        let scanProgress: XrayScanProgress = progressManager.createScanProgress(descriptorData.fullpath);
        // Scan
        let startGraphScan: number = Date.now();
        descriptorData.dependenciesGraphScan = await this._scanManager
            .scanDependencyGraph(scanProgress, descriptorGraph, checkCanceled)
            .finally(() => {
                scanProgress.setPercentage(100);
                descriptorData.graphScanTimestamp = Date.now();
            });
        if (!descriptorData.dependenciesGraphScan.vulnerabilities && !descriptorData.dependenciesGraphScan.violations) {
            return undefined;
        }
        // Populate response
        descriptorData.impactTreeData = Object.fromEntries(
            DescriptorUtils.createImpactedPaths(descriptorGraph, descriptorData.dependenciesGraphScan).entries()
        );
        let issuesCount: number = DescriptorUtils.populateDescriptorData(descriptorNode, descriptorData);
        this._logManager.logMessage(
            'Found ' +
                issuesCount +
                ' issues for descriptor ' +
                descriptorData.fullpath +
                ' (elapsed ' +
                (descriptorData.graphScanTimestamp - startGraphScan) / 1000 +
                ' seconds)',
            'INFO'
        );
        return issuesCount > 0 ? descriptorNode : undefined;
    }

    /**
     * Run CVE applicable scan async task.
     * @param root - the root node to generate the issues inside
     * @param descriptorData - the descriptor data to store the response inside
     * @param descriptorNode - the descriptor node with the CVE to scan
     * @param abortController - the controller to abort the operation
     */
    private async cveApplicableScanning(
        root: IssuesRootTreeNode,
        descriptorData: DescriptorIssuesData,
        descriptorNode: DescriptorTreeNode,
        abortController: AbortController
    ): Promise<void> {
        let cveToScan: string[] = [];
        descriptorNode.issues.forEach(issue => {
            if (issue instanceof CveTreeNode && issue.cve && issue.cve.cve && !cveToScan.find(i => issue.cve && i == issue.cve.cve)) {
                cveToScan.push(issue.cve.cve);
            }
        });
        if (cveToScan.length == 0) {
            return;
        }
        this._logManager.logMessage('Scanning descriptor ' + descriptorData.fullpath + ' for cve applicability issues', 'INFO');

        let startApplicableTime: number = Date.now();
        descriptorData.applicableIssues = await this._scanManager.scanApplicability(
            path.dirname(descriptorData.fullpath),
            abortController,
            cveToScan
        );

        if (descriptorData.applicableIssues && descriptorData.applicableIssues.applicableCve) {
            descriptorData.applicableScanTimestamp = Date.now();
            let applicableIssuesCount: number = AnalyzerUtils.populateApplicableIssues(root, descriptorNode, descriptorData);
            this._logManager.logMessage(
                'Found ' +
                    applicableIssuesCount +
                    " applicable CVE issues in descriptor = '" +
                    descriptorData.fullpath +
                    "' (elapsed " +
                    (Date.now() - startApplicableTime) / 1000 +
                    ' seconds)',
                'INFO'
            );
            root.apply();
        }
    }

    /**
     * Search for file with issues and return the tree node that matches the path.
     * Values return base on the last call to Refresh
     * @param filePath - file path to search if issues exists for it
     * @returns - the file tree node if exists issues for it, undefined otherwise
     */
    public getFileIssuesTree(filePath: string): FileTreeNode | undefined {
        for (let [workspace, issuesRoot] of this._workspaceToRoot) {
            if (this.isWorkspaceContainsFile(workspace.uri.fsPath, filePath)) {
                return issuesRoot?.getFileTreeNode(filePath);
            }
        }
        return undefined;
    }

    public getDescriptorTreeNode(filePath: string): DescriptorTreeNode | undefined {
        const tree: FileTreeNode | undefined = this.getFileIssuesTree(filePath);
        return tree instanceof DescriptorTreeNode ? tree : undefined;
    }

    public getCodeIssueTree(filePath: string): CodeFileTreeNode | undefined {
        const tree: FileTreeNode | undefined = this.getFileIssuesTree(filePath);
        return tree instanceof CodeFileTreeNode ? tree : undefined;
    }

    private isWorkspaceContainsFile(workspace: string, file: string): boolean {
        return file.startsWith(workspace);
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

    public getChildren(element?: IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode): vscode.ProviderResult<any> {
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
        // Code file type
        if (element instanceof CodeFileTreeNode) {
            return Promise.resolve(element.issues);
        }
    }

    public async getTreeItem(element: IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode | IssueTreeNode): Promise<vscode.TreeItem> {
        if (
            element instanceof FileTreeNode ||
            element instanceof DependencyIssuesTreeNode ||
            element instanceof LicenseIssueTreeNode ||
            element instanceof CveTreeNode ||
            element instanceof IssueTreeNode
        ) {
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
            // File nodes
            if (element instanceof FileTreeNode) {
                element.command = Utils.createNodeCommand('jfrog.issues.file.open', 'Open file', [element.fullPath]);
            }
            if (element instanceof DependencyIssuesTreeNode) {
                let directDependenciesLocations: vscode.Range[] = await DescriptorUtils.getDirectDependenciesLocations(element);
                if (directDependenciesLocations?.length > 0) {
                    element.command = Utils.createNodeCommand('jfrog.issues.file.open.location', 'Open location in file', [
                        element.parent.fullPath,
                        // If there are more than one direct dependency with this indirect jump to the first one
                        directDependenciesLocations[0]
                    ]);
                }
            }
            // Descriptor issues nodes
            if (element instanceof CveTreeNode || element instanceof LicenseIssueTreeNode) {
                element.command = Utils.createNodeCommand('jfrog.view.details.page', 'Show details', [element.getDetailsPage()]);
            }
            // Source code issues nodes
            if (element instanceof ApplicableTreeNode || element instanceof EosTreeNode) {
                element.command = Utils.createNodeCommand('jfrog.issues.file.open.details', 'Open file location and show details', [
                    element.parent.fullPath,
                    element.regionWithIssue,
                    element.getDetailsPage()
                ]);
            }
        }
        return element;
    }

    public getParent(
        element: FileTreeNode | DependencyIssuesTreeNode | CveTreeNode | LicenseIssueTreeNode | CodeIssueTreeNode
    ): Thenable<IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    /**
     * Refresh the view to the current nodes in _workspaceToRoot
     */
    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
