import * as vscode from 'vscode';
import { GeneralInfo } from '../../types/generalInfo';
import { Issue } from '../../types/issue';
import { Severity, SeverityUtils } from '../../types/severity';
import { ScanUtils } from '../../utils/scanUtils';
import { TreesManager } from '../treesManager';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { CiManager } from '../../utils/builds/ciManager';
import { BuildGeneralInfo, Status } from '../../types/buildGeneralinfo';
import { Configuration } from '../../utils/configuration';
import { BuildsNode } from './dependenciesRoot/buildsTree';
import { BuildsUtils } from '../../utils/builds/buildsUtils';
import * as Collections from 'typescript-collections';
import { License } from '../../types/license';
import { Scope } from '../../types/scope';

export class BuildsDataProvider implements vscode.TreeDataProvider<DependenciesTreeNode> {
    private _filteredDependenciesTree: DependenciesTreeNode | undefined;
    protected _dependenciesTree!: DependenciesTreeNode;
    protected _allBuildsTree!: DependenciesTreeNode;
    private _ciInProgress: boolean = false;
    private _filterLicenses: Collections.Set<License> = new Collections.Set(license => license.fullName);
    private _filterScopes: Collections.Set<Scope> = new Collections.Set(scope => scope.label);

    constructor(protected _treesManager: TreesManager) {}

    public get dependenciesTree() {
        return this._dependenciesTree;
    }

    public get allBuildsTree() {
        return this._allBuildsTree;
    }

    public async stateChange(onChangeFire: () => void) {
        if (!this.dependenciesTree) {
            this.refresh(false, onChangeFire);
            return;
        }
        onChangeFire();
    }

    public async refresh(quickScan: boolean, onChangeFire: () => void) {
        if (this._ciInProgress) {
            vscode.window.showInformationMessage('Loading still in progress...');
            return;
        }
        try {
            this._ciInProgress = true;
            ScanUtils.setScanInProgress(true);
            const credentialsSet: boolean = this._treesManager.connectionManager.areAllCredentialsSet();
            this._treesManager.logManager.logMessage('Starting to load builds details...', 'INFO');
            await this.repopulateTree(quickScan, credentialsSet, onChangeFire);
            vscode.commands.executeCommand('jfrog.xray.focus');
            this._treesManager.logManager.setSuccess();
        } catch (error) {
            if (error.message !== CiManager.CI_CANCELLATION_ERROR) {
                // Unexpected error
                throw error;
            }
            this.clearAllTrees();
            onChangeFire();
            vscode.window.showInformationMessage(error.message);
        } finally {
            this._ciInProgress = false;
            ScanUtils.setScanInProgress(false);
        }
    }

    public getTreeItem(element: DependenciesTreeNode): vscode.TreeItem {
        element.command = {
            command: 'jfrog.xray.focus',
            title: '',
            arguments: [element]
        };
        if (element instanceof BuildsNode) {
            let status: Status = (<BuildGeneralInfo>element.generalInfo).status;
            element.iconPath = BuildsUtils.getIcon(status);
        } else {
            let topIssue: Issue = element.topIssue;
            element.iconPath = SeverityUtils.getIcon(topIssue ? topIssue.severity : Severity.Normal);
        }
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
        return Promise.resolve(rootChildren);
    }

    public loadBuild(buildGeneralInfo: BuildGeneralInfo, onChangeFire: () => void) {
        try {
            this.clearDisplayedTree();
            new CiManager(this._treesManager).loadBuildTree(buildGeneralInfo.artifactId, buildGeneralInfo.version, this._dependenciesTree);
            this.fillFilters(this._dependenciesTree);
            onChangeFire();
        } catch (error) {
            this._treesManager.logManager.logError(
                new Error(`Failed to load build '${buildGeneralInfo.artifactId}/${buildGeneralInfo.version}'.`),
                true
            );
        }
    }

    private fillFilters(node: DependenciesTreeNode) {
        for (const child of node.children) {
            this.fillFilters(child);
        }
        this.filterLicenses.union(node.licenses);
        node.generalInfo.scopes.map(scope => this.filterScopes.add(new Scope(scope)));
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
        onChangeFire();
    }

    private async repopulateTree(quickScan: boolean, credentialsSet: boolean, onChangeFire: () => void) {
        await ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
            this.clearAllTrees();
            if (credentialsSet) {
                let allBuilds: DependenciesTreeNode = <DependenciesTreeNode>this.allBuildsTree;
                await new CiManager(this._treesManager, allBuilds).refreshBuilds(progress, checkCanceled);
                this.loadFirstBuild(quickScan, onChangeFire);
            }
        }, 'Loading Builds Scans');
    }

    public loadFirstBuild(quickScan: boolean, onChangeFire: () => void): void {
        if (!!this._allBuildsTree && this._allBuildsTree.children.length > 0) {
            let dependencyTree: DependenciesTreeNode = this._allBuildsTree.children[0];
            let generalInfo: BuildGeneralInfo = <BuildGeneralInfo>dependencyTree.generalInfo;
            this.loadBuild(generalInfo, onChangeFire);
        } else {
            this.clearAllTrees();
            onChangeFire();
            this._treesManager.logManager.logMessage(
                'Could not find any builds that match the provided pattern: ' + Configuration.getBuildsPattern(),
                'INFO'
            );
            if (!quickScan) {
                vscode.window.showErrorMessage('Search did not find any build that match the provided pattern', <vscode.MessageOptions>{
                    modal: false
                });
            }
        }
    }

    private clearAllTrees() {
        this.clearDisplayedTree();
        this._filteredDependenciesTree = undefined;
        let generalInfo: GeneralInfo = new GeneralInfo('', '', [], '', '');
        this._allBuildsTree = new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.Expanded);
    }

    private clearDisplayedTree() {
        let generalInfo: GeneralInfo = new GeneralInfo('', '', [], '', '');
        this._dependenciesTree = new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.Expanded);
    }

    public get filterLicenses(): Collections.Set<License> {
        return this._filterLicenses;
    }

    public get filterScopes(): Collections.Set<Scope> {
        return this._filterScopes;
    }
}
