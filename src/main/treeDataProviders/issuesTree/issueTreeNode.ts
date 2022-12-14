import * as vscode from 'vscode';

// leaf of the tree
export class IssueTreeNode extends vscode.TreeItem {
    constructor(label: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }
}
