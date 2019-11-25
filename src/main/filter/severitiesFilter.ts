import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { SeverityStrings, SeverityUtils } from '../types/severity';
import { AbstractFilter } from './abstractFilter';

export class SeverityFilter extends AbstractFilter {
    constructor() {
        super();
    }

    /** @override */
    protected getValues(): vscode.QuickPickItem[] {
        return Object.values(SeverityStrings).map(
            severity =>
                <vscode.QuickPickItem>{
                    label: severity,
                    picked: true
                }
        );
    }

    /** @override */
    public isNodePicked(dependenciesTreeNode: DependenciesTreeNode): boolean {
        if (!this._choice || (this.isPicked(SeverityStrings.Normal) && dependenciesTreeNode.issues.isEmpty())) {
            return true;
        }
        return dependenciesTreeNode.issues
            .toArray()
            .map(issue => issue.severity)
            .map(severity => SeverityUtils.getString(severity))
            .some(severityName => this.isPicked(severityName));
    }
}
