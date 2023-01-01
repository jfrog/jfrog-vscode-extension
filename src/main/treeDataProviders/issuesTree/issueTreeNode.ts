import * as vscode from 'vscode';
import { Severity } from '../../types/severity';

/**
 * Describes an Xray issue node, the leaf of the issues tree for the 'Issues' view.
 */
export class IssueTreeNode extends vscode.TreeItem {
    protected _watchNames: string[] | undefined;

    constructor(protected _issue_id: string, protected _severity: Severity, label: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);
    }

    public get issueId(): string {
        return this._issue_id;
    }

    public get severity(): Severity {
        return this._severity;
    }

    public set severity(value: Severity) {
        this._severity = value;
    }

    public get watchNames(): string[] | undefined {
        return this._watchNames;
    }
}
