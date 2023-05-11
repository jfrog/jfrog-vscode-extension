import * as vscode from 'vscode';
import { ScanManager, SupportedScans } from '../../scanLogic/scanManager';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { IssuesRootTreeNode } from './issuesRootTreeNode';
import { FileTreeNode } from './fileTreeNode';
import { DescriptorTreeNode } from './descriptorTree/descriptorTreeNode';
import { DependencyIssuesTreeNode } from './descriptorTree/dependencyIssuesTreeNode';
import { CveTreeNode } from './descriptorTree/cveTreeNode';
import { CacheManager } from '../../cache/cacheManager';
import { PackageType } from '../../types/projectType';
import { Severity, SeverityUtils } from '../../types/severity';
import { StepProgress } from '../utils/stepProgress';
import { Utils } from '../../utils/utils';
import { DependencyUtils } from '../utils/dependencyUtils';
import { TreesManager } from '../treesManager';
import { IssueTreeNode } from './issueTreeNode';
import { LogManager } from '../../log/logManager';
import { LicenseIssueTreeNode } from './descriptorTree/licenseIssueTreeNode';
import { CodeIssueTreeNode } from './codeFileTree/codeIssueTreeNode';
import { CodeFileTreeNode } from './codeFileTree/codeFileTreeNode';
import { ApplicableTreeNode } from './codeFileTree/applicableTreeNode';
import { EosTreeNode } from './codeFileTree/eosTreeNode';
import { EnvironmentTreeNode } from './descriptorTree/environmentTreeNode';
import { ProjectDependencyTreeNode } from './descriptorTree/projectDependencyTreeNode';
import { ScanResults, DependencyScanResults } from '../../types/workspaceIssuesDetails';
import { AnalyzerUtils } from '../utils/analyzerUtils';
import { IacTreeNode } from './codeFileTree/iacTreeNode';
import { SecretTreeNode } from './codeFileTree/secretsTreeNode';

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
    private _supportedScans: SupportedScans = {} as SupportedScans;

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
        this._supportedScans = await this._scanManager.getSupportedScans();
        await this._scanManager.updateResources(this._supportedScans);
        // Scan
        this._logManager.logMessage('Refresh: starting workspace scans 🐸', 'INFO');
        this.clearTree();
        ScanUtils.setFirstScanForWorkspace(false);
        const startRefreshTimestamp: number = Date.now();
        await this.scanWorkspaces()
            .catch(error => this._logManager.logError(error, true))
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
                                this._cacheManager.issuesCache.store(workspace, scanResults);
                            }
                        });
                }, "Refreshing workspace '" + workspace.name + "'")
            );
        }
        await Promise.all(workspaceScans);
        this.onChangeFire();
    }

    /**
     * Calculate the number of tasks that will be preformed in the workspace scan.
     * Components:
     * 1. Build Dependency Tree = task for each package type that exists in the workspace
     * 2. Dependency scan = task for each descriptor in the workspace (Applicability is optional sub task of dependency)
     * 3. Iac scan = one task for all the workspace
     * 4. Secrets scan = one task for all the workspace
     * 5. Eos scan = one task for all the workspace
     * @param supportedScans - the details about the entitlements of the user
     * @param descriptors - all the descriptors in the workspace
     * @returns the number of tasks that will be preformed async and report to the progress bar
     */
    public static getNumberOfTasksInRepopulate(supportedScans: SupportedScans, descriptors: Map<PackageType, vscode.Uri[]>): number {
        return (
            (supportedScans.eos ? 1 : 0) +
            (supportedScans.iac ? 1 : 0) +
            (supportedScans.secrets ? 1 : 0) +
            (supportedScans.dependencies ? descriptors.size + Array.from(descriptors.values()).reduce((acc, val) => acc + val.length, 0) : 0)
        );
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
        let workspaceDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors([root.workSpace], this._logManager);
        let subStepsCount: number = IssuesTreeDataProvider.getNumberOfTasksInRepopulate(this._supportedScans, workspaceDescriptors);
        checkCanceled();
        DependencyUtils.sendUsageReport(this._supportedScans, workspaceDescriptors, this._treesManager.connectionManager);
        // Scan workspace
        let scansPromises: Promise<any>[] = [];
        progressManager.startStep('🔎 Scanning for issues', subStepsCount);
        if (this._supportedScans.dependencies) {
            // Dependency graph and applicability scans for each package
            for (const [type, descriptorsPaths] of workspaceDescriptors) {
                scansPromises.push(
                    DependencyUtils.scanPackageDependencies(
                        this._scanManager,
                        scanResults,
                        root,
                        type,
                        descriptorsPaths,
                        progressManager,
                        this._supportedScans.applicability
                    ).catch(err => ScanUtils.onScanError(err, this._logManager, true))
                );
            }
        }
        if (this._supportedScans.iac) {
            // Scan the workspace for Infrastructure As Code (Iac) issues
            scansPromises.push(
                AnalyzerUtils.runIac(scanResults, root, this._scanManager, progressManager).catch(err =>
                    ScanUtils.onScanError(err, this._logManager, true)
                )
            );
        }
        if (this._supportedScans.secrets) {
            // Scan the workspace for Secrets issues
            scansPromises.push(
                AnalyzerUtils.runSecrets(scanResults, root, this._scanManager, progressManager).catch(err =>
                    ScanUtils.onScanError(err, this._logManager, true)
                )
            );
        }
        if (supportedScans.eos) {
            // Scan the workspace for Eos issues
            scansPromises.push(
                AnalyzerUtils.runEos(
                    scanResults,
                    root,
                    Array.from(workspaceDescriptors.keys() ?? []),
                    this._scanManager,
                    progressManager
                ).catch(err => ScanUtils.onScanError(err, this._logManager, true))
            );
        }

        await Promise.all(scansPromises);
        return root;
    }

    /**
     * Loads the issues from the last scan of all the workspaces if they exist.
     */
    public async loadFromCache() {
        await ScanUtils.backgroundTask(async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            if (!this._cacheManager.issuesCache) {
                return;
            }
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
                    this._cacheManager.issuesCache
                        .loadIssues(workspace)
                        .then(root => {
                            if (root && root.children.length > 0) {
                                this._workspaceToRoot.set(workspace, root);
                                root.title = Utils.getLastScanString(root.oldestScanTimestamp);
                                root.apply();
                            } else {
                                this._logManager.logMessage("WorkSpace '" + workspace.name + "' has no data in cache", 'DEBUG');
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
    public getDescriptorIssuesData(filePath: string): DependencyScanResults | undefined {
        for (const workspace of this._workspaceToRoot.keys()) {
            if (filePath.includes(workspace.uri.fsPath)) {
                let scanResults: ScanResults | undefined = this._cacheManager.issuesCache?.get(workspace);
                if (scanResults) {
                    return scanResults.descriptorsIssues.find(descriptor => descriptor.fullPath == filePath);
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
                element.command = Utils.createNodeCommand('jfrog.issues.file.open', 'Open file', [element.projectFilePath]);
            }
            if (element instanceof DependencyIssuesTreeNode) {
                let directDependenciesLocations: vscode.Range[] = await DependencyUtils.getDirectDependenciesLocations(element);
                if (directDependenciesLocations?.length > 0) {
                    element.command = Utils.createNodeCommand('jfrog.issues.file.open.location', 'Open location in file', [
                        element.parent.projectFilePath,
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
            if (
                element instanceof ApplicableTreeNode ||
                element instanceof EosTreeNode ||
                element instanceof IacTreeNode ||
                element instanceof SecretTreeNode
            ) {
                element.command = Utils.createNodeCommand('jfrog.issues.file.open.details', 'Open file location and show details', [
                    element.parent.projectFilePath,
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
