import * as vscode from 'vscode';
import { ScanCacheManager } from '../cache/scanCacheManager';
import { ExtensionComponent } from '../extensionComponent';
import { BuildsNode } from '../treeDataProviders/ciNodes/buildsTree';
import { DependencyTreeNode } from '../dependencyTree/dependencyTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { LicensesFilter } from './licensesFilter';
import { ScopesFilter } from './scopeFilter';
import { SeverityFilter as SeveritiesFilter } from './severitiesFilter';

enum FilterTypes {
    SEVERITY = '$(alert)   Issues severity',
    LICENSE = '$(law)   Licenses',
    SCOPE = '$(telescope)   Scope',
    CLEAR_ALL = '$(trashcan)   Reset filters'
}

/**
 * Manage the filters of the components tree.
 */
export class FilterManager implements ExtensionComponent {
    private _severitiesFilter: SeveritiesFilter;
    private _licensesFilter: LicensesFilter;
    private _scopeFilter: ScopesFilter;

    constructor(private _treesManager: TreesManager, scanCacheManager: ScanCacheManager) {
        this._severitiesFilter = new SeveritiesFilter(scanCacheManager);
        this._licensesFilter = new LicensesFilter(_treesManager);
        this._scopeFilter = new ScopesFilter(_treesManager);
    }

    public activate() {
        return this;
    }

    public async showFilterMenu() {
        let choice: string | undefined = await vscode.window.showQuickPick(this.getFilters(), <vscode.QuickPickOptions>{
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
            case FilterTypes.SCOPE:
                this._scopeFilter.showFilterMenu(this);
                break;
            case FilterTypes.CLEAR_ALL:
                this._severitiesFilter.clearFilters();
                this._licensesFilter.clearFilters();
                this._scopeFilter.clearFilters();
                this._treesManager.buildsTreesProvider.applyFilters(undefined);
        }
    }

    public getFilters(): string[] {
        let results: string[] = [];
        Object.values(FilterTypes).forEach(filterType => {
            // Includes sub-menu of scopes in filters if there is at least one scope in the project.
            if (filterType === FilterTypes.SCOPE && this._scopeFilter.getValues().length === 0) {
                return;
            }
            results.push(filterType);
        });
        return results;
    }

    public applyFilters() {
        let unfilteredRoot: DependencyTreeNode = this._treesManager.buildsTreesProvider.dependenciesTree;
        if (!(unfilteredRoot instanceof DependencyTreeNode)) {
            return;
        }
        let filteredRoot: DependencyTreeNode = unfilteredRoot.shallowClone();
        this._applyFilters(unfilteredRoot, filteredRoot, { nodeSelected: true });
        this._treesManager.buildsTreesProvider.applyFilters(filteredRoot);
    }

    private _applyFilters(unfilteredNode: DependencyTreeNode, filteredNode: DependencyTreeNode, picked: { nodeSelected: boolean }): void {
        // Keep this node if it compiles with all filters or if it is a build node.
        picked.nodeSelected =
            (this._severitiesFilter.isNodePicked(unfilteredNode) &&
                this._licensesFilter.isNodePicked(unfilteredNode) &&
                this._scopeFilter.isNodePicked(unfilteredNode)) ||
            unfilteredNode instanceof BuildsNode;
        for (let unfilteredChild of unfilteredNode.children) {
            let filteredNodeChild: DependencyTreeNode = unfilteredChild.shallowClone();
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
