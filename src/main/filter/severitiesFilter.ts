import * as vscode from 'vscode';
import { ScanCacheManager } from '../cache/scanCacheManager';
import { DependencyTreeNode } from '../dependencyTree/dependencyTreeNode';
import { SeverityStrings, SeverityUtils } from '../types/severity';
import { AbstractFilter } from './abstractFilter';

export class SeverityFilter extends AbstractFilter {
    constructor(private _scanCacheManager: ScanCacheManager) {
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
    public isNodePicked(dependenciesTreeNode: DependencyTreeNode): boolean {
        if (!this._choice || (this.isPicked(SeverityStrings.Normal) && dependenciesTreeNode.issues.isEmpty())) {
            return true;
        }
        return (
            dependenciesTreeNode.issues
                .toArray()
                .map(issueKey => this._scanCacheManager.getIssue(issueKey.issue_id))
                .filter(issue => issue)
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                .map(issue => issue!.severity)
                .map(severity => SeverityUtils.getString(severity))
                .some(severityName => this.isPicked(severityName))
        );
    }
}
