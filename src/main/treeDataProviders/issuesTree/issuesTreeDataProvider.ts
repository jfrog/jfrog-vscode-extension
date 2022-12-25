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
import { DescriptorIssuesData, FileIssuesData, IssuesCache, WorkspaceIssuesData } from '../../cache/issuesCache';
import { getNumberOfSupportedPackgeTypes, PackageType } from '../../types/projectType';
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
import { EosScanRequest } from '../../scanLogic/scanRunners/eosScan';

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
                            if (root && root.children.length > 0) {
                                this._workspaceToRoot.set(workspace, root);
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                                root.apply();
                            } else {
                                this._logManager.logMessage("WorkSpace '" + workspace.name + "' has no data in cache", 'DEBUG');
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
                    if (descriptor.applicableIssues) {
                        this._logManager.logMessage("Loading cve appliable data for workSpace '" + workSpace.name + "'", 'DEBUG');
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
                    let workspaceData: WorkspaceIssuesData = {
                        path: workspace.uri.fsPath,
                        descriptorsIssuesData: [],
                        failedFiles: []
                    } as WorkspaceIssuesData;
                    // Create workspace tree root node to give feedback and update the user on any change while handling the async scan task
                    let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, '🔎 Scanning...');
                    this._workspaceToRoot.set(workspace, root);
                    let shouldDeleteRoot: boolean = false;
                    let shouldCacheRoot: boolean = false;
                    // Execute workspace scan task
                    await this.repopulateWorkspaceTree(workspaceData, root, progress, checkCanceled)
                        .then(() => {
                            this._logManager.logMessage("Workspace '" + workspace.name + "' scan ended", 'INFO');
                            shouldDeleteRoot = !IssuesCache.hasInformation(workspaceData);
                            shouldCacheRoot = IssuesCache.hasIssues(workspaceData);
                            if (shouldDeleteRoot) {
                                this._logManager.logMessage("🐸 Workspace '" + workspace.name + "' has no issues", 'INFO', false, false, true);
                            }
                            if (workspaceData.failedFiles.length > 0) {
                                root.title = 'Scan failed';
                            } else {
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                            }
                        })
                        .catch(error => {
                            if (error instanceof ScanCancellationError) {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task was canceled", 'INFO');
                                shouldDeleteRoot = !IssuesCache.hasInformation(workspaceData);
                                shouldCacheRoot = IssuesCache.hasIssues(workspaceData);
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
                            if (shouldCacheRoot && this._cacheManager.issuesCache) {
                                this._cacheManager.issuesCache.store(workspace, workspaceData);
                            }
                        });
                }, "Refreshing workspace '" + workspace.name + "'")
            );
        }
        this.onChangeFire();
        await Promise.all(workspaceScans);
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
        let progressManager: StepProgress = new StepProgress(progress, this._logManager, () => {
            this.onChangeFire();
            checkCanceled();
        });
        // Scan workspace to prepare the needed information for the scans and progress
        progress.report({ message: '👷 Preparing workspace' });
        let workspcaeDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors([root.workSpace], this._logManager);
        let descriptorsCount: number = 0;
        for (let despcriptorPaths of workspcaeDescriptors.values()) {
            descriptorsCount += despcriptorPaths.length;
        }
        checkCanceled();
        let graphSupported: boolean = await this._scanManager.validateGraphSupported();
        checkCanceled();
        let status: { eosDone: boolean; graphDone: boolean } = { eosDone: false, graphDone: !graphSupported };

        progressManager.startStep('🔎 Scanning for issues', graphSupported ? getNumberOfSupportedPackgeTypes() + descriptorsCount : 0);
        let scansPromises: Promise<any>[] = [];
        // Building dependency tree + dependency graph scan for each descriptor
        if (graphSupported) {
            scansPromises.push(
                this.descriptorsScanning(workspaceData, root, workspcaeDescriptors, progressManager, checkCanceled).finally(
                    () => (status.graphDone = true)
                )
            );
        }
        await Promise.all(scansPromises);
        return root;
    }

    /**
     * Preform security scanning for all the descriptors in the workspace in two substeps:
     * 1. Build the dependency tree for all the workspace
     * 2. For each descriptor in the workspace and preporm Xray dependency grpah scanning.
     * @param workspaceData - the given object that holds all the issues data for the workspace and will be populated at the task
     * @param root - the dependenciesTreeRoot that will be populated and will hold the final tree
     * @param workspcaeDescriptors - map of all the descriptors in the workspace with the packeType of the descriptor as key and the file paths as values
     * @param progressManager - the progress manager for the workspace scanning process
     * @param scansPromises - the array of all the scans that will be preformed async
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     */
    private async descriptorsScanning(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        workspcaeDescriptors: Map<PackageType, vscode.Uri[]>,
        progressManager: StepProgress,
        checkCanceled: () => void
    ): Promise<any> {
        // 1. Build workspace dependecy tree for all the descriptors
        let workspaceDependenciesTree: DependenciesTreeNode = await DependenciesTreesFactory.createDependenciesTrees(
            workspcaeDescriptors,
            [root.workSpace],
            [],
            this._treesManager,
            progressManager,
            checkCanceled
        );
        // 2. Scan descriptors
        let scansPromises: Promise<any>[] = [];
        for (const [type, descriptorsPaths] of workspcaeDescriptors) {
            for (const descriptorPath of descriptorsPaths) {
                const descriptorData: DescriptorIssuesData = {
                    type: type,
                    name: Utils.getLastSegment(descriptorPath.fsPath),
                    fullpath: descriptorPath.fsPath
                } as DescriptorIssuesData;

                let descriptorNode: DescriptorTreeNode = new DescriptorTreeNode(descriptorData.fullpath, descriptorData.type);
                // Search for the dependecy graph of the descriptor
                let descriptorGraph: RootNode | undefined = DescriptorUtils.getDependencyGraph(workspaceDependenciesTree, descriptorPath.fsPath);
                if (!descriptorGraph) {
                    progressManager.reportProgress();
                    this._logManager.logMessage("Can't find descriptor graph for " + descriptorPath.fsPath, 'DEBUG');
                    continue;
                }
                // Project Not install
                if (descriptorGraph?.label?.toString().includes('[Not installed]')) {
                    progressManager.reportProgress();
                    this.onFileScanError(
                        workspaceData,
                        root,
                        new FileScanError('Project with descriptor file ' + descriptorPath.fsPath + ' is not installed', '[Project not installed]'),
                        descriptorData
                    );
                    continue;
                }
                // Scan the descriptor
                scansPromises.push(
                    this.scanDescriptorGraph(descriptorData, descriptorNode, descriptorGraph, progressManager, checkCanceled)
                        .then(async descriptorWithIssues => {
                            if (descriptorWithIssues) {
                                // Add to data and update view
                                workspaceData.descriptorsIssuesData.push(descriptorData);
                                root.addChildAndApply(descriptorWithIssues);
                                progressManager.onProgress();
                                await this.cveApplicableScanning(root, descriptorData, descriptorNode, progressManager).catch(err =>
                                    this.onScanError(err)
                                );
                            }
                        })
                        .catch(error => this.onFileScanError(workspaceData, root, error, descriptorData))
                        .finally(() => progressManager.onProgress())
                );
            }
        }
        await Promise.all(scansPromises);
    }

    /**
     * Handle errors that occur during workspace scan, checks if cancele was requested.
     * @param error - the error that occur
     * @param handle - if true the error will be logged and not thrown/returned.
     * @returns -  undefined if error was handled or error otherwise
     */
    private onScanError(error: Error, handle: boolean = true): Error | undefined {
        if (error instanceof ScanCancellationError) {
            throw error;
        }
        if (handle) {
            this._logManager.logError(error, true);
            return undefined;
        }
        return error;
    }

    /**
     * Handle errors that occur when scanning a specific file.
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
                    failedFile.name = error.reason;
                }
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
        this._logManager.logMessage('Scanning descriptor ' + descriptorData.fullpath + ' for issues', 'INFO');
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
                ' (elapsed=' +
                (descriptorData.graphScanTimestamp - startGraphScan) / 1000 +
                'sec)',
            'INFO'
        );
        return issuesCount > 0 ? descriptorNode : undefined;
    }

    private async cveApplicableScanning(
        root: IssuesRootTreeNode,
        descriptorData: DescriptorIssuesData,
        descriptorNode: DescriptorTreeNode,
        progressManager: StepProgress
    ): Promise<void> {
        
        let cveToScan: string[] = [];
        descriptorNode.issues.forEach(issue => {
            if (issue instanceof CveTreeNode && issue.cve) {
                cveToScan.push(issue.cve.cve);
            }
        });

        let startApplicableTime: number = Date.now();
        descriptorData.applicableIssues = await this._scanManager
            .scanApplicability(path.dirname(descriptorData.fullpath), cveToScan)
            .finally(() => progressManager.reportProgress());
        if (descriptorData.applicableIssues && descriptorData.applicableIssues.applicableCve) {
            descriptorData.applicableScanTimestamp = Date.now();
            let applicableIssuesCount: number = AnalyzerUtils.populateApplicableIssues(root, descriptorNode, descriptorData);
            this._logManager.logMessage(
                'Found ' +
                    applicableIssuesCount +
                    " applicable cve issues in workspace = '" +
                    descriptorData.fullpath +
                    "' (elapsed:" +
                    (Date.now() - startApplicableTime) / 1000 +
                    'sec)',
                'DEBUG'
            );
            root.apply();
            progressManager.onProgress();
        }
    }

    private async runEos(
        workspaceData: WorkspaceIssuesData,
        root: IssuesRootTreeNode,
        workspcaeDescriptors: Map<PackageType, vscode.Uri[]>,
        progressManager: StepProgress
    ): Promise<any> {
        // Prepare
        let requests: EosScanRequest[] = [];
        for (const [type, descriptorPaths] of workspcaeDescriptors) {
            let language: string | undefined;
            switch (type) {
                case PackageType.Python:
                    language = 'python';
                    break;
                case PackageType.Maven:
                    language = 'java';
                    break;
                case PackageType.Npm:
                    language = 'js';
                    break;
            }
            if (language) {
                let roots: Set<string> = new Set<string>();
                for (const descriptorPath of descriptorPaths) {
                    let directory: string = path.dirname(descriptorPath.fsPath);
                    if (!roots.has(directory)) {
                        roots.add(directory);
                        // TODO: removw when issue on eos is resolve
                        requests.push({
                            language: language,
                            roots: [directory]
                        } as EosScanRequest);
                    }
                }
                // TODO: uncomment when issue on eos is resolve
                // if (roots.size > 0) {
                //     requests.push({
                //         language: language,
                //         roots: Array.from(roots)
                //     } as EosScanRequest);
                // }
            }
        }
        if (requests.length == 0) {
            progressManager.reportProgress();
            return;
        }
        let startTime: number = Date.now();
        workspaceData.eosScan = await this._scanManager.scanEos(...requests).finally(() => progressManager.reportProgress());
        if (workspaceData.eosScan) {
            workspaceData.eosScanTimestamp = Date.now();
            let applicableIssuesCount: number = AnalyzerUtils.populateEosIssues(root, workspaceData);
            this._logManager.logMessage(
                'Found ' +
                    applicableIssuesCount +
                    " Eos issues in workspace = '" +
                    workspaceData.path +
                    "' (elapsed:" +
                    (Date.now() - startTime) / 1000 +
                    'sec)',
                'DEBUG'
            );

            root.apply();
            progressManager.onProgress();
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
        // Code file type
        if (element instanceof CodeFileTreeNode) {
            return Promise.resolve(element.issues);
        }
    }

    getTreeItem(element: IssuesRootTreeNode | FileTreeNode | DependencyIssuesTreeNode | IssueTreeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
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
            // Descriptor issues nodes
            if (element instanceof CveTreeNode || element instanceof LicenseIssueTreeNode) {
                // if (element instanceof CveTreeNode) {
                //     element.applicableDetails; // = this.getCveApplicableDetails(element);
                // }
                element.command = Utils.createNodeCommand('jfrog.view.dependency.details.page', 'Show details', [element.getDetailsPage()]);
            }
            // TODO: Source code issues nodes
            if (element instanceof CodeIssueTreeNode) {
                element.command = Utils.createNodeCommand('jfrog.issues.file.open.location', 'Open file location', [
                    element.parent.fullPath,
                    element.regionWithIssue
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
