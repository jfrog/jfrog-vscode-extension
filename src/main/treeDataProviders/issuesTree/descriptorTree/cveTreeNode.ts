import * as vscode from 'vscode';
import { Severity } from '../../../types/severity';
import { IssueDependencyTreeNode } from './issueDependencyTreeNode';

export class CveTreeNode extends vscode.TreeItem { 

    constructor(
        private _cve: string,
        private _severity: Severity,
        private _parent: IssueDependencyTreeNode,
    ) {
        super(_cve, vscode.TreeItemCollapsibleState.None);
    }

    public get cve(): string {
        return this._cve;
    }

    public get severity(): Severity {
        return this._severity;
    }

    public get parent(): IssueDependencyTreeNode {
        return this._parent;
    }
}