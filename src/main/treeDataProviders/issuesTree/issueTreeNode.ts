import * as vscode from 'vscode';
import { ContextKeys } from '../../constants/contextKeys';
import { Severity } from '../../types/severity';

/**
 * Describes an Xray issue node, the leaf of the issues tree for the 'Issues' view.
 */
export class IssueTreeNode extends vscode.TreeItem {
    protected _watchNames: string[] = [];

    constructor(protected _issue_id: string, protected _severity: Severity, label: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);
        this.contextValue += ContextKeys.COPY_TO_CLIPBOARD_ENABLED;
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

    public get watchNames(): string[] {
        return this._watchNames;
    }
}
