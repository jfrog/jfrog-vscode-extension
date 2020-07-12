import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { LicensesFilter } from './licensesFilter';
import { SeverityFilter as SeveritiesFilter } from './severitiesFilter';

enum FilterTypes {
    SEVERITY = '$(alert)   Issues severity',
    LICENSE = '$(law)   Licenses',
    CLEAR_ALL = '$(trashcan)   Reset filters'
}

/**
 * Manage the filters of the components tree.
 */
export class FilterManager implements ExtensionComponent {
    private _severitiesFilter: SeveritiesFilter;
    private _licensesFilter: LicensesFilter;

    constructor(private _treesManager: TreesManager) {
        this._severitiesFilter = new SeveritiesFilter();
        this._licensesFilter = new LicensesFilter(_treesManager);
    }

    public activate(context: vscode.ExtensionContext) {
        return this;
    }

    public async showFilterMenu() {
        let choice: string | undefined = await vscode.window.showQuickPick(Object.values(FilterTypes), <vscode.QuickPickOptions>{
            placeHolder: 'Filter',
            canPickMany: false
        });
        switch (choice) {
            case FilterTypes.SEVERITY:
                this._severitiesFilter.showFilterMenu(this);
                break;
            case FilterTypes.LICENSE:
                this._licensesFilter.showFilterMenu(this);
                break;
            case FilterTypes.CLEAR_ALL:
                this._severitiesFilter.clearFilters();
                this._licensesFilter.clearFilters();
                this._treesManager.dependenciesTreeDataProvider.applyFilters(undefined);
        }
    }

    public applyFilters() {
        let unfilteredRoot: DependenciesTreeNode = this._treesManager.dependenciesTreeDataProvider.dependenciesTree;
        if (!(unfilteredRoot instanceof DependenciesTreeNode)) {
            return;
        }
        let filteredRoot: DependenciesTreeNode = unfilteredRoot.shallowClone();
        this._applyFilters(unfilteredRoot, filteredRoot, { nodeSelected: true });
        this._treesManager.dependenciesTreeDataProvider.applyFilters(filteredRoot);
    }

    private _applyFilters(unfilteredNode: DependenciesTreeNode, filteredNode: DependenciesTreeNode, picked: { nodeSelected: Boolean }): void {
        picked.nodeSelected = this._severitiesFilter.isNodePicked(unfilteredNode) && this._licensesFilter.isNodePicked(unfilteredNode);
        for (let unfilteredChild of unfilteredNode.children) {
            let filteredNodeChild: DependenciesTreeNode = unfilteredChild.shallowClone();
            let childSelected: any = { nodeSelected: false };
            this._applyFilters(unfilteredChild, filteredNodeChild, childSelected);
            if (childSelected.nodeSelected) {
                picked.nodeSelected = true;
                filteredNode.addChild(filteredNodeChild);
                filteredNodeChild.parent = filteredNode;
            }
        }
    }
}
