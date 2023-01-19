import * as vscode from 'vscode';

import { Severity } from '../../../types/severity';
import { IssueTreeNode } from '../issueTreeNode';
import { CodeFileTreeNode } from './codeFileTreeNode';

export class CodeIssueTreeNode extends IssueTreeNode {
    private _regionWithIssue: vscode.Range;

    constructor(issueId: string, private _parent: CodeFileTreeNode, region: vscode.Range, severity?: Severity, lbl?: string) {
        super(issueId, severity ?? Severity.Unknown, lbl ?? issueId, vscode.TreeItemCollapsibleState.None);
        this._regionWithIssue = new vscode.Range(
            new vscode.Position(region.start.line - 1 > 0 ? region.start.line - 1 : 0, region.start.character),
            new vscode.Position(region.end.line - 1 > 0 ? region.end.line - 1 : 0, region.end.character)
        );
        this.description = 'row = ' + region.start.line + ', column = ' + region.start.character;
    }

    public get parent(): CodeFileTreeNode {
        return this._parent;
    }

    public get regionWithIssue(): vscode.Range {
        return this._regionWithIssue;
    }
}
