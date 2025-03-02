import * as vscode from 'vscode';
import { CacheManager } from '../../cache/cacheManager';
import { LogManager } from '../../log/logManager';
import { ScanManager } from '../../scanLogic/scanManager';
import { Severity, SeverityUtils } from '../../types/severity';
import { DependencyScanResults, EntryIssuesData, ScanResults } from '../../types/workspaceIssuesDetails';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { Utils } from '../../utils/utils';
import { TreesManager } from '../treesManager';
import { AnalyzerUtils } from '../utils/analyzerUtils';
import { DependencyUtils } from '../utils/dependencyUtils';
import { StepProgress } from '../utils/stepProgress';
import { ApplicableTreeNode } from './codeFileTree/applicableTreeNode';
import { CodeFileTreeNode } from './codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from './codeFileTree/codeIssueTreeNode';
import { IacTreeNode } from './codeFileTree/iacTreeNode';
import { SastTreeNode } from './codeFileTree/sastTreeNode';
import { SecretTreeNode } from './codeFileTree/secretsTreeNode';
import { CveTreeNode } from './descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from './descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from './descriptorTree/descriptorTreeNode';
import { EnvironmentTreeNode } from './descriptorTree/environmentTreeNode';
import { LicenseIssueTreeNode } from './descriptorTree/licenseIssueTreeNode';
import { ProjectDependencyTreeNode } from './descriptorTree/projectDependencyTreeNode';
import { FileTreeNode } from './fileTreeNode';
import { IssueTreeNode } from './issueTreeNode';
import { IssuesRootTreeNode } from './issuesRootTreeNode';
import { LogUtils } from '../../log/logUtils';

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
        if (!this._treesManager.connectionManager.areXrayCredentialsSet()) {
            this._logManager.logMessage('Refresh: Xray credentials are not set', 'INFO');
            this.clearTree();
            return;
        }
        if (!scan) {
            this._logManager.logMessage('Refresh: loading data from cache', 'INFO');
            await this.loadFromCache();
            return;
        }
        if (this._scanInProgress) {
            vscode.window.showInformationMessage('Previous scan still running...');
            return;
        }
        await this.scan();
    }

    private async scan() {
        // Prepare
        this.scanInProgress = true;
        this._logManager.showOutput();
        // Scan
        this._logManager.logMessage('Refresh: starting workspace scans 🐸', 'INFO');
        this.clearTree();
        ScanUtils.setFirstScanForWorkspace(false);
        const startRefreshTimestamp: number = Date.now();
        await this.scanWorkspaces()
            .catch(error => LogUtils.logErrorWithAnalytics(error, this._scanManager.connectionManager, true))
            .finally(() => {
                this.scanInProgress = false;
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
        for (const workspace of this._workspaceFolders) {
            this._cacheManager.delete(workspace);
        }
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
                    const scanResults: ScanResults = new ScanResults(workspace.uri.fsPath);
                    // Create workspace tree root node to give feedback and update the user on any change while handling the async scan task
                    let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, '🔎 Scanning...');
                    this._workspaceToRoot.set(workspace, root);
                    let shouldDeleteRoot: boolean = false;
                    // Execute workspace scan task
                    await this.repopulateWorkspaceTree(scanResults, root, progress, checkCanceled)
                        .then(() => {
                            this._logManager.logMessage("Workspace '" + workspace.name + "' scan ended", 'INFO');
                            shouldDeleteRoot = !scanResults.hasInformation();
                            root.title =
                                (scanResults.failedFiles.length > 0 ? 'Scan failed - ' : '') + Utils.getLastScanString(root.oldestScanTimestamp);
                        })
                        .catch(error => {
                            if (error instanceof ScanCancellationError) {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task was canceled", 'INFO');
                                shouldDeleteRoot = !scanResults.hasInformation();
                                root.title = 'Scan canceled';
                            } else {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' scan task ended with error:", 'ERR');
                                LogUtils.logErrorWithAnalytics(error, this._scanManager.connectionManager, true);
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
                            this._cacheManager.save(workspace, scanResults);
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
     * @param scanResults - the given object that holds all the issues data for the workspace and will be populated at the task
     * @param root - the given tree root for the workspace, the nodes that the user will see at the issues view
     * @param progress - the progress notification window for the given task
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     * @returns root argument for chaining
     */
    private async repopulateWorkspaceTree(
        scanResults: ScanResults,
        root: IssuesRootTreeNode,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void
    ): Promise<IssuesRootTreeNode> {
        // Prepare the needed information for the scans
        progress.report({ message: '👷 Preparing workspace' });
        let progressManager: StepProgress = new StepProgress(progress, checkCanceled, () => this.onChangeFire(), this._logManager);
        await this._scanManager.scanWorkspace(
            scanResults,
            root,
            progressManager,
            await ScanUtils.locatePackageDescriptors([root.workspace], this._logManager),
            checkCanceled
        );
        return root;
    }

    /**
     * Loads the issues from the last scan of all the workspaces if they exist.
     */
    public async loadFromCache() {
        await ScanUtils.backgroundTask(async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            let progressManager: StepProgress = new StepProgress(progress);
            progressManager.startStep('Loading workspace issues', this._workspaceFolders.length);
            let workspaceLoads: Promise<void>[] = [];
            let firstTime: boolean = true;
            for (const workspace of this._workspaceFolders) {
                // Create dummy root to give input to the user while waiting for the workspace loading task or when error occur
                const tempRoot: IssuesRootTreeNode = new IssuesRootTreeNode(workspace, 'Loading...');
                this._workspaceToRoot.set(workspace, tempRoot);
                this.onChangeFire();

                // Create a new async load task for each workspace
                workspaceLoads.push(
                    this.loadIssueFromCache(workspace)
                        .then(root => {
                            if (root && root.children.length > 0) {
                                this._workspaceToRoot.set(workspace, root);
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                                root.apply();
                            } else {
                                this._logManager.logMessage("Workspace '" + workspace.name + "' has no data in cache", 'DEBUG');
                                this._workspaceToRoot.set(workspace, undefined);
                            }
                            if (firstTime) {
                                firstTime = !root;
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
                        .finally(() => progressManager.reportProgress())
                );
            }
            await Promise.all(workspaceLoads);
            ScanUtils.setFirstScanForWorkspace(firstTime);
        });
        this.onChangeFire();
    }

    /**
     * Async task to load the issues from the last scan of a given workspace
     * @param workspace - the workspace to load it's issues
     * @returns - the workspace issues if the exists, undefined otherwise
     */
    private async loadIssueFromCache(workspace: vscode.WorkspaceFolder) {
        // Check if data for the workspace exists in the cache
        let scanResults: ScanResults | undefined = await this._cacheManager.load(workspace);
        if (!scanResults) {
            return undefined;
        }
        this._logManager.logMessage("Loading issues from last scan for the workspace '" + workspace.name + "'", 'INFO');
        let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace);
        if (scanResults.failedFiles) {
            // Load files that had error on the last scan and create tree node in the root
            scanResults.failedFiles.forEach((file: EntryIssuesData) => {
                this._logManager.logMessage("Loading file with scan error '" + file.name + "': '" + file.fullPath + "'", 'DEBUG');
                let failed: FileTreeNode = FileTreeNode.createFailedScanNode(file.fullPath, file.name);
                root.children.push(failed);
            });
        }
        if (scanResults.descriptorsIssues) {
            // Load descriptors issues and create tree node in the root
            scanResults.descriptorsIssues.forEach((graphScanResult: DependencyScanResults) => {
                let projectNode: ProjectDependencyTreeNode = this.createProjectNode(graphScanResult, root);
                this._logManager.logMessage("Loading issues for '" + graphScanResult.fullPath + "'", 'DEBUG');
                DependencyUtils.populateDependencyScanResults(projectNode, graphScanResult);
                if (projectNode && graphScanResult.applicableIssues && graphScanResult.applicableIssues.scannedCve) {
                    AnalyzerUtils.populateApplicableIssues(root, projectNode, graphScanResult);
                }
                root.children.push(projectNode);
            });
        }
        if (scanResults.iacScan) {
            AnalyzerUtils.populateIacIssues(root, scanResults);
        }
        if (scanResults.secretsScan) {
            AnalyzerUtils.populateSecretsIssues(root, scanResults);
        }
        if (scanResults.sastScan) {
            root.sastScanTimeStamp = scanResults.sastScanTimestamp;
            AnalyzerUtils.populateSastIssues(root, scanResults);
        }
        return root;
    }

    /**
     * Creates a project node based on the scan results.
     * @param graphScanResult - The scan results for a project.
     * @param parent - The parent node in the issues tree.
     * @returns A project node.
     */
    private createProjectNode(graphScanResult: DependencyScanResults, parent: IssuesRootTreeNode): ProjectDependencyTreeNode {
        return graphScanResult.isEnvironment
            ? new EnvironmentTreeNode(graphScanResult.fullPath, graphScanResult.type, parent)
            : new DescriptorTreeNode(graphScanResult.fullPath, graphScanResult.type, parent);
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
        if (element instanceof ProjectDependencyTreeNode) {
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
            if (element instanceof EnvironmentTreeNode) {
                return element;
            }
            // File nodes
            if (element instanceof FileTreeNode) {
                element.command = Utils.createNodeCommand('jfrog.issues.file.open', 'Open file', [decodeURIComponent(element.projectFilePath)]);
            }
            if (element instanceof DependencyIssuesTreeNode) {
                let directDependenciesLocations: vscode.Range[] = await DependencyUtils.getDirectDependenciesLocations(element);
                if (directDependenciesLocations?.length > 0) {
                    element.command = Utils.createNodeCommand('jfrog.issues.file.open.location', 'Open location in file', [
                        decodeURIComponent(element.parent.projectFilePath),
                        // If there are more than one direct dependency with this indirect jump to the first one
                        directDependenciesLocations[0]
                    ]);
                }
            }
            // Descriptor issues nodes
            if (element instanceof CveTreeNode || element instanceof LicenseIssueTreeNode) {
                element.command = Utils.createNodeCommand('jfrog.webview.tab.open', 'Show details', [element.getDetailsPage()]);
            }
            // Source code issues nodes
            if (
                element instanceof ApplicableTreeNode ||
                element instanceof SastTreeNode ||
                element instanceof IacTreeNode ||
                element instanceof SecretTreeNode
            ) {
                element.command = Utils.createNodeCommand('jfrog.issues.file.open.details', 'Open file location and show details', [
                    decodeURIComponent(element.parent.projectFilePath),
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

    public set scanInProgress(value: boolean) {
        this._scanInProgress = value;
        ScanUtils.setScanInProgress(value);
    }

    /**
     * Refresh the view to the current nodes in _workspaceToRoot
     */
    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}
