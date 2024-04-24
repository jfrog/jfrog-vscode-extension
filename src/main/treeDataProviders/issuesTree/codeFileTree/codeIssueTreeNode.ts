import * as vscode from 'vscode';

import { Severity } from '../../../types/severity';
import { IssueTreeNode } from '../issueTreeNode';
import { CodeFileTreeNode } from './codeFileTreeNode';

export abstract class CodeIssueTreeNode extends IssueTreeNode {
    private _regionWithIssue: vscode.Range;

    constructor(issueId: string, private _parent: CodeFileTreeNode, region: vscode.Range, severity?: Severity, label?: string) {
        super(issueId, severity ?? Severity.Unknown, label ?? issueId, vscode.TreeItemCollapsibleState.None);
        this._regionWithIssue = new vscode.Range(this.toVscodePosition(region.start), this.toVscodePosition(region.end));
        this.description = 'line = ' + region.start.line + ', column = ' + region.start.character;
    }

    public get parent(): CodeFileTreeNode {
        return this._parent;
    }

    public get regionWithIssue(): vscode.Range {
        return this._regionWithIssue;
    }

    // Analyzer locations minimum is 1, vscode positions starts at 0
    private toVscodePosition(position: vscode.Position): vscode.Position {
        let line: number = position.line > 0 ? position.line - 1 : 0;
        let col: number = position.character > 0 ? position.character - 1 : 0;
        return new vscode.Position(line, col);
    }
}
