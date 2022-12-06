import * as vscode from 'vscode';
// import * as path from 'path';

import { Severity, SeverityUtils } from '../../types/severity';
import { Utils } from '../utils/utils';
import { IssuesRootTreeNode } from './issuesRootTreeNode';
// import { ProjectRootTreeNode } from './projectRootTreeNode';


export class BaseFileTreeNode extends vscode.TreeItem {
    
    private _parent: IssuesRootTreeNode | undefined;
    protected _severity: Severity = Severity.Unknown;
    private _timeStamp: number | undefined;

    constructor(
        private _filePath: string,
        _parent?: IssuesRootTreeNode,
        _timeStamp?: number,
        // private _parent?: ProjectRootTreeNode,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        // File node is named as its file name.
        super(Utils.getLastSegment(_filePath), collapsibleState ?? vscode.TreeItemCollapsibleState.Collapsed);
        // if (_parent) {
        //     _parent.children.push(this);
        // }
        this.parent = _parent;
    }

    public get timeStamp(): number | undefined {
        return this._timeStamp;
    }
    public set timeStamp(value: number | undefined) {
        this._timeStamp = value;
    }

    public get parent(): IssuesRootTreeNode | undefined{
        return this._parent;
    }
    public set parent(value: IssuesRootTreeNode | undefined) {
        this._parent = value;
        this.setDescription();
    }

    public get severity(): Severity {
        return this._severity;
    }

    public set severity(value: Severity) {
        this._severity = value;
    }

    public get filePath(): string {
        return this._filePath;
    }

    public set filePath(value: string) {
        this._filePath = value;
        this.setDescription();
    }

    private setDescription() {
        let description: string = this._filePath;

        if(this._parent && this._filePath.startsWith(this._parent.workSpace.uri.fsPath)) {
            description = "." + this._filePath.substring(this._parent.workSpace.uri.fsPath.length);
            this.tooltip = "Severity: " + SeverityUtils.getString(this._severity) + "\nPath: " + this._filePath;
        }

        this.description = description;
    }

}