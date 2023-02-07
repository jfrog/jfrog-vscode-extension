import * as vscode from 'vscode';
import { DependencyTreeNode } from '../dependencyTree/dependencyTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ILicenseCacheObject } from '../types/licenseCacheObject';
import { AbstractFilter } from './abstractFilter';

export class LicensesFilter extends AbstractFilter {
    constructor(private _treesManager: TreesManager) {
        super();
    }

    /** @override */
    protected getValues(): vscode.QuickPickItem[] {
        return this._treesManager.buildsTreesProvider.filterLicenses.toArray().map(licenseKey => {
            let license: ILicenseCacheObject | undefined = this._treesManager.buildsTreesProvider.scanCacheManager.getLicense(licenseKey.licenseName);
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
    public isNodePicked(dependenciesTreeNode: DependencyTreeNode): boolean {
        if (!this._choice) {
            return true;
        }
        return dependenciesTreeNode.licenses
            .toArray()
            .map(license => license)
            .some(licenseKey => this.isPicked(licenseKey.licenseName));
    }
}
