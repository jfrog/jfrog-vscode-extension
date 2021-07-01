import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { GeneralInfo } from '../../types/generalInfo';
import { Issue } from '../../types/issue';
import { License } from '../../types/license';
import { Scope } from '../../types/scope';
import { Severity, SeverityUtils } from '../../types/severity';
import { ScanUtils } from '../../utils/scanUtils';
import { TreesManager } from '../treesManager';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { CiManager } from "../../utils/builds/ciManager";
import {BuildGeneralInfo} from "../../types/buildGeneralinfo";

export class BuildsDataProvider implements vscode.TreeDataProvider<DependenciesTreeNode> {
    private _filterLicenses: Collections.Set<License> = new Collections.Set(license => license.fullName);
    private _filterScopes: Collections.Set<Scope> = new Collections.Set(scope => scope.label);
    private _filteredDependenciesTree: DependenciesTreeNode | undefined;
    protected _dependenciesTree!: DependenciesTreeNode;
    protected _allBuildsTree!: DependenciesTreeNode;
    private _ciInProgress: boolean = false;

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
            const credentialsSet: boolean = this._treesManager.connectionManager.areAllCredentialsSet();
            this._treesManager.logManager.logMessage('Starting to load builds details...', 'INFO');
            await this.repopulateTree(credentialsSet, onChangeFire);
            vscode.commands.executeCommand('jfrog.xray.focus');
            this._treesManager.logManager.setSuccess();
        } catch (error) {
            if (error.message !== CiManager.CI_CANCELLATION_ERROR) {
                // Unexpected error
                throw error;
            }
            this.clearAllTrees();
            vscode.window.showInformationMessage(error.message);
        } finally {
            this._ciInProgress = false;
        }
    }

    public getTreeItem(element: DependenciesTreeNode): vscode.TreeItem {
        element.command = {
            command: 'jfrog.xray.focus',
            title: '',
            arguments: [element]
        };
        let topIssue: Issue = element.topIssue;
        element.iconPath = SeverityUtils.getIcon(topIssue ? topIssue.severity : Severity.Normal);
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
        //return Promise.resolve(rootChildren.length === 1 ? rootChildren[0].children : rootChildren);
        return Promise.resolve(rootChildren);
    }

    public loadBuild(buildGeneralInfo: BuildGeneralInfo, onChangeFire: () => void) {
        try {
            this.clearDisplayedTree();
            new CiManager(this._treesManager).loadBuildTree(buildGeneralInfo.artifactId, buildGeneralInfo.version, this._dependenciesTree);
            onChangeFire();
        } catch (error) {
            this._treesManager.logManager.logError(new Error(`Failed to load build '${buildGeneralInfo.artifactId}/${buildGeneralInfo.version}'.`), false);
        }
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

    private async repopulateTree(credentialsSet: boolean, onChangeFire: () => void) {
        await ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
            this.clearAllTrees();
            if (credentialsSet) {
                let allBuilds: DependenciesTreeNode = <DependenciesTreeNode>this.allBuildsTree;
                await new CiManager(this._treesManager, allBuilds).refreshBuilds(progress, checkCanceled);
                this.loadFirstBuild(onChangeFire);
            }
        }, 'Loading Builds Scans');
    }

    public loadFirstBuild(onChangeFire: () => void): void {
        let generalInfo: BuildGeneralInfo = new BuildGeneralInfo('');
        if (!!this._allBuildsTree.children) {
            let dependencyTree: DependenciesTreeNode = this._allBuildsTree.children[0];
            generalInfo = <BuildGeneralInfo> dependencyTree.generalInfo;
        }
        this.loadBuild(generalInfo, onChangeFire);
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
