import * as vscode from 'vscode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractFilter } from './abstractFilter';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { License } from '../types/license';

export class LicensesFilter extends AbstractFilter {
    constructor(private _treesManager: TreesManager) {
        super();
    }

    /** @override */
    protected getValues(): vscode.QuickPickItem[] {
        return this._treesManager.treeDataProviderManager.filterLicenses.toArray().map(licenseName => {
            let license: License | undefined = this._treesManager.scanCacheManager.getLicense(licenseName);
            if (!license) {
                return <vscode.QuickPickItem>{};
            }
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
            .map(license => license)
            .some(licenseName => this.isPicked(licenseName));
    }
}
