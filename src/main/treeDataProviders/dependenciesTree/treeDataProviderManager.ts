import * as vscode from 'vscode';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import {TreesManager} from "../treesManager";

export class TreeDataProviderManager implements vscode.TreeDataProvider<DependenciesTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<DependenciesTreeNode | undefined> = new vscode.EventEmitter<DependenciesTreeNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<DependenciesTreeNode | undefined> = this._onDidChangeTreeData.event;

    constructor(protected _treesManager: TreesManager) {}

    public getTreeItem(element: DependenciesTreeNode): vscode.TreeItem {
        if (this._treesManager.isLocalState()) {
            return this._treesManager.dependenciesTreeDataProvider.getTreeItem(element);
        }
        return this._treesManager.buildsTreesProvider.getTreeItem(element);
    }

    public getChildren(element?: DependenciesTreeNode): Thenable<DependenciesTreeNode[]> {
        if (this._treesManager.isLocalState()) {
            return this._treesManager.dependenciesTreeDataProvider.getChildren(element);
        }
        return this._treesManager.buildsTreesProvider.getChildren(element);
    }

    public getParent(element: DependenciesTreeNode): Thenable<DependenciesTreeNode | undefined> {
        if (this._treesManager.isLocalState()) {
            return this._treesManager.dependenciesTreeDataProvider.getParent(element);
        }
        return this._treesManager.buildsTreesProvider.getParent(element);
    }

    public refresh(quickScan: boolean = false) {
        if (this._treesManager.isLocalState()) {
            this._treesManager.dependenciesTreeDataProvider.refresh(quickScan, () => this.onChangeFire());
        } else {
            this._treesManager.buildsTreesProvider.refresh(quickScan, () => this.onChangeFire());
        }
    }

    public stateChange() {
        if (this._treesManager.isLocalState()) {
            this._treesManager.dependenciesTreeDataProvider.stateChange(() => this.onChangeFire());
        } else {
            this._treesManager.buildsTreesProvider.stateChange(() => this.onChangeFire());
        }
    }

    public onChangeFire(): void {
        this._onDidChangeTreeData.fire();
    }

    public applyFilters(filteredDependenciesTree: DependenciesTreeNode | undefined) {
        if (this._treesManager.isLocalState()) {
            this._treesManager.dependenciesTreeDataProvider.applyFilters(filteredDependenciesTree, () => this.onChangeFire());
        } else {
            this._treesManager.buildsTreesProvider.applyFilters(filteredDependenciesTree, () => this.onChangeFire());
        }
    }

    public removeNode(node: DependenciesTreeNode) {
        if (this._treesManager.isLocalState()) {
            this._treesManager.dependenciesTreeDataProvider.removeNode(node, () => this.onChangeFire());
        } else {
            this._treesManager.buildsTreesProvider.removeNode(node, () => this.onChangeFire());
        }
    }

    public loadFirstBuild(): void {
        if (this._treesManager.isCiState()) {
            this._treesManager.buildsTreesProvider.loadFirstBuild(() => this.onChangeFire());
        }
    }

}
