import { IDependencyPage } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { Severity } from '../../../types/severity';
import { CveTreeNode } from '../descriptorTree/cveTreeNode';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';

/**
 * Describe a CVE applicable evidence issue
 */
export class ApplicableTreeNode extends CodeIssueTreeNode {
    constructor(private _node: CveTreeNode, parent: CodeFileTreeNode, regionWithIssue: vscode.Range, severity?: Severity) {
        super(_node.labelId, parent, regionWithIssue, severity);
    }

    public get cveNode(): CveTreeNode {
        return this._node;
    }

    /**
     * Get the CVE details page of the issue
     */
    public getDetailsPage(): IDependencyPage {
        return this._node.getDetailsPage();
    }
}
