import * as vscode from 'vscode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractFilter } from './abstractFilter';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';

export class ScopesFilter extends AbstractFilter {
    constructor(private _treesManager: TreesManager) {
        super();
    }

    /** @override */
    public getValues(): vscode.QuickPickItem[] {
       let values: vscode.QuickPickItem[] = this._treesManager.dependenciesTreeDataProvider.filterScopes.toArray().map(scope => {
            return <vscode.QuickPickItem>{
                label: scope.label,
                picked: true
            };
        });
        return values.some(v => v.label !== 'None') ? values : [];
    }

    /** @override */
    public isNodePicked(dependenciesTreeNode: DependenciesTreeNode): boolean {
        if (!this._choice) {
            return true;
        }
        return dependenciesTreeNode.generalInfo.scopes.some(scope => this.isPicked(scope));
    }
}
