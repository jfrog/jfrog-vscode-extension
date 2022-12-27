import * as vscode from 'vscode';

import { FileRegion } from '../../../scanLogic/scanRunners/analyzerModels';
import { Severity } from '../../../types/severity';
import { Region } from '../fileTreeNode';
import { IssueTreeNode } from '../issueTreeNode';
import { CodeFileTreeNode } from './codeFileTreeNode';

export class CodeIssueTreeNode extends IssueTreeNode {

    private _regionWithIssue: Region;

    constructor(issueId: string, private _parent: CodeFileTreeNode,  region: FileRegion, severity?: Severity) {
        super(issueId, severity ?? Severity.Unknown, issueId, vscode.TreeItemCollapsibleState.None);
        this._regionWithIssue = {start: new vscode.Position(region.startLine - 1 > 0 ? region.startLine - 1 : 0,region.startColumn), end: new vscode.Position(region.endLine -1 > 0 ? region.endLine - 1 : 0,region.endColumn)};
        this.description = 'row = ' + region.startLine + ', column = ' + region.startColumn;
    }

    public get parent(): CodeFileTreeNode {
        return this._parent;
    }

    public get regionWithIssue(): Region {
        return this._regionWithIssue;
    }
}
