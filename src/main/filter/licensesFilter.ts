import * as vscode from 'vscode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractFilter } from './abstractFilter';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';

export class LicensesFilter extends AbstractFilter {
    constructor(private _treesManager: TreesManager) {
        super();
    }

    /** @override */
    protected getValues(): vscode.QuickPickItem[] {
        return this._treesManager.dependenciesTreeDataProvider.filterLicenses.toArray().map(license => {
            return <vscode.QuickPickItem>{
                label: license.name,
                description: license.fullName,
                picked: true
            };
        });
    }

    /** @override */
    public isNodePicked(dependenciesTreeNode: DependenciesTreeNode): boolean {
        if (!this._choice) {
            return true;
        }
        return dependenciesTreeNode.licenses
            .toArray()
            .map(license => license.name)
            .some(licenseName => this.isPicked(licenseName));
    }
}
