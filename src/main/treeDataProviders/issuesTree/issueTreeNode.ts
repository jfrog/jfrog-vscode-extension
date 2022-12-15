import * as vscode from 'vscode';
import { Severity } from '../../types/severity';

// leaf of the tree
export class IssueTreeNode extends vscode.TreeItem {
    constructor(protected _severity: Severity, label: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }

    public get severity(): Severity {
        return this._severity;
    }
}
