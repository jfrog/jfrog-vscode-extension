import * as vscode from 'vscode';
import { Severity } from '../../../types/severity';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';

export class ApplicableTreeNode extends CodeIssueTreeNode {
    constructor(issueId: string, parent: CodeFileTreeNode, regionWithIssue: vscode.Range, severity?: Severity) {
        super(issueId, parent, regionWithIssue, severity);
    }
}
