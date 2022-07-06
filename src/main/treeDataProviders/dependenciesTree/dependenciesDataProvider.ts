import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { ScanLogicManager } from '../../scanLogic/scanLogicManager';
import { ProjectDetails } from '../../types/projectDetails';
import { GeneralInfo } from '../../types/generalInfo';
import { ILicenseKey } from '../../types/licenseKey';
import { INodeInfo } from '../../types/nodeInfo';
import { Scope } from '../../types/scope';
import { Severity, SeverityUtils } from '../../types/severity';
import { MavenUtils } from '../../utils/mavenUtils';
import { ScanCancellationError, ScanUtils } from '../../utils/scanUtils';
import { TreesManager } from '../treesManager';
import { RootNode } from './dependenciesRoot/rootTree';
import { DependenciesTreesFactory } from './dependenciesTreeFactory';
import { DependenciesTreeNode } from './dependenciesTreeNode';

export class DependenciesTreeDataProvider implements vscode.TreeDataProvider<DependenciesTreeNode> {
    private _filterLicenses: Set<ILicenseKey> = new Set();
    private _filterScopes: Set<Scope> = new Set(scope => scope.label);
    private _filteredDependenciesTree: DependenciesTreeNode | undefined;
    protected _dependenciesTree!: DependenciesTreeNode;
    private _scanInProgress: boolean = false;
    private _scannedProjects: ProjectDetails[] | undefined;

    constructor(
        protected _workspaceFolders: vscode.WorkspaceFolder[],
        protected _treesManager: TreesManager,
        private _scanLogicManager: ScanLogicManager
    ) {}

    public get scannedProjects(): ProjectDetails[] | undefined {
        return this._scannedProjects;
    }

    public set scannedProjects(value: ProjectDetails[] | undefined) {
        this._scannedProjects = value;
    }

    public get dependenciesTree() {
        return this._dependenciesTree;
    }

    public get filteredDependenciesTree() {
        return this._filteredDependenciesTree;
    }

    public async stateChange(onChangeFire: () => void) {
        if (!this.dependenciesTree) {
            this.refresh(false, onChangeFire);
            return;
        }
        onChangeFire();
    }

    public async refresh(quickScan: boolean, onChangeFire: () => void) {
        if (!this._treesManager.connectionManager.areXrayCredentialsSet()) {
            return;
        }
        if (this._scanInProgress) {
            if (!quickScan) {
                vscode.window.showInformationMessage('Previous scan still running...');
            }
            return;
        }
        this._scanInProgress = true;
        ScanUtils.setScanInProgress(true);
        this._treesManager.logManager.logMessage('Starting ' + (quickScan ? 'quick' : 'full') + ' scan', 'INFO');
        this.repopulateTree(quickScan, onChangeFire)
            .then(() => {
                vscode.commands.executeCommand('jfrog.xray.focus');
                this._treesManager.logManager.setSuccess();
            })
            .catch(error => {
                this.clearTree();
                if (error instanceof ScanCancellationError) {
                    vscode.window.showInformationMessage(error.message);
                } else {
                    this._treesManager.logManager.logError(error, !quickScan);
                }
            })
            .finally(() => {
                this._scanInProgress = false;
                ScanUtils.setScanInProgress(false);
                this._treesManager.logManager.logMessage('Xray scan completed', 'INFO');
            });
    }

    public getTreeItem(element: DependenciesTreeNode): vscode.TreeItem {
        element.command = {
            command: 'jfrog.xray.focus',
            title: '',
            arguments: [element]
        };
        let topSeverity: Severity = element.topSeverity;
        element.iconPath = SeverityUtils.getIcon(topSeverity ? topSeverity : Severity.Normal);
        return element;
    }

    public getChildren(element?: DependenciesTreeNode): Thenable<DependenciesTreeNode[]> {
        if (!this.dependenciesTree) {
            return Promise.resolve([]);
        }
        if (element) {
            return Promise.resolve(element.children);
        }
        let rootChildren: DependenciesTreeNode[] = this._filteredDependenciesTree
            ? this._filteredDependenciesTree.children
            : this.dependenciesTree.children;
        return Promise.resolve(rootChildren.length === 1 ? rootChildren[0].children : rootChildren);
    }

    public getParent(element: DependenciesTreeNode): Thenable<DependenciesTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    public applyFilters(filteredDependenciesTree: DependenciesTreeNode | undefined, onChangeFire: () => void) {
        this._filteredDependenciesTree = filteredDependenciesTree;
        onChangeFire();
    }

    public removeNode(node: DependenciesTreeNode, onChangeFire: () => void) {
        let nodeIndex: number | undefined = node.parent?.children.indexOf(node);
        if (nodeIndex === undefined || nodeIndex < 0) {
            return;
        }
        node.parent?.children.splice(nodeIndex, 1);
        this.refresh(true, onChangeFire);
    }

    public addXrayInfoToTree(root: DependenciesTreeNode) {
        root.children.forEach(child => {
            let generalInfo: GeneralInfo = child.generalInfo;
            let scanCacheObject: INodeInfo | undefined = this._treesManager.scanCacheManager.getNodeInfo(generalInfo.getComponentId());
            if (scanCacheObject) {
                child.topSeverity = scanCacheObject.top_severity;
                scanCacheObject.issues.forEach(issue => child.issues.add(issue));
                scanCacheObject.licenses.forEach(license => child.licenses.add(license));
                this.filterLicenses.union(child.licenses);
                generalInfo.scopes.map(scope => this.filterScopes.add(new Scope(scope)));
            }
            this.addXrayInfoToTree(child);
        });
    }

    private async repopulateTree(quickScan: boolean, onChangeFire: () => void) {
        await ScanUtils.scanWithProgress(
            async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
                // Skip the 'await' here to avoid blocking dependency tree scanning
                const updatePromise: Promise<void> = this._treesManager.sourceCodeTreeDataProvider.update();
                progress.report({ message: '1/3:👷 Building dependency tree' });
                this.clearTree();
                let workspaceRoot: DependenciesTreeNode = <DependenciesTreeNode>this.dependenciesTree;
                this._scannedProjects = [];
                await DependenciesTreesFactory.createDependenciesTrees(
                    this._workspaceFolders,
                    this._scannedProjects,
                    this._treesManager,
                    workspaceRoot,
                    quickScan
                );
                progress.report({ message: '2/3:📦 Dependencies scanning' });
                await this._scanLogicManager.scanAndCache(progress, this._scannedProjects, quickScan, checkCanceled);
                for (let node of workspaceRoot.children) {
                    this.addXrayInfoToTree(node);
                    if (node instanceof RootNode) {
                        node.setUpgradableDependencies(this._treesManager.scanCacheManager);
                    }
                    node.issues = node.processTreeIssues();
                }
                progress.report({ message: '3/3📝 Code vulnerability scanning' });
                await updatePromise;
                await this._treesManager.sourceCodeTreeDataProvider.refresh();
                onChangeFire();
            },
            'Scanning workspace',
            quickScan
        );
    }

    private clearTree() {
        this._filteredDependenciesTree = undefined;
        let generalInfo: GeneralInfo = new GeneralInfo('', '', [], '', '');
        this._dependenciesTree = new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.Expanded);
    }

    public get filterLicenses(): Set<ILicenseKey> {
        return this._filterLicenses;
    }

    public get filterScopes(): Set<Scope> {
        return this._filterScopes;
    }

    public getDependenciesTreeNode(pkgType: string, path?: string): DependenciesTreeNode | undefined {
        if (!(this.dependenciesTree instanceof DependenciesTreeNode)) {
            return undefined;
        }
        // Unlike other build tools, which rely that each direct dep can be found in the root's child, Maven can have direct dep in each node because,
        // Maven has parent pom which is the root of the tree all the other poms are located beneath it.
        // In order to solve this, we create a map  (fs-path -> node) find the correct pom in the tree.
        if (pkgType === 'maven') {
            return MavenUtils.pathToNode.get(path || '');
        }
        let root: DependenciesTreeNode = this._filteredDependenciesTree || this.dependenciesTree;
        for (let dependenciesTree of root.children) {
            let generalInfo: GeneralInfo = dependenciesTree.generalInfo;
            if (generalInfo.pkgType === pkgType && (!path || generalInfo.path === path)) {
                return dependenciesTree;
            }
        }
        return undefined;
    }
}
