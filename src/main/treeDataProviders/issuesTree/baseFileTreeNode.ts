import * as vscode from 'vscode';
// import * as path from 'path';

import { Severity, SeverityUtils } from '../../types/severity';
import { Utils } from '../utils/utils';
import { IssuesRootTreeNode } from './issuesRootTreeNode';
// import { ProjectRootTreeNode } from './projectRootTreeNode';

export class BaseFileTreeNode extends vscode.TreeItem {
    // private _parent: IssuesRootTreeNode | undefined;
    protected _severity: Severity = Severity.Unknown;
    // private _timeStamp: number | undefined;
    private _name: string;
    private _fullPath: string;

    constructor(
        filePath: string,
        private _parent?: IssuesRootTreeNode,
        private _timeStamp?: number // private _parent?: ProjectRootTreeNode,
    ) {
        // File node is named as its file name.
        super('File');
        this._name = Utils.getLastSegment(filePath);
        this._fullPath = filePath;
        // if (_parent) {
        //     _parent.children.push(this);
        // }
        // this.parent = _parent;
        // this.setDescription();
    }

    public static createFailedScanNode(fullPath: string, reason?: string): BaseFileTreeNode {
        const node: BaseFileTreeNode = new BaseFileTreeNode(fullPath, undefined, vscode.TreeItemCollapsibleState.None);
        node._name += reason ? ' - ' + reason : '';
        node.description = 'Fail to scan file';
        node.tooltip = fullPath;
        node._severity = Severity.Unknown;
        return node;
    }

    protected applyDescription(forceChange: boolean = true) {
        if (this.description == undefined || forceChange) {
            let description: string = this._fullPath;
            if (this._parent && this._fullPath.startsWith(this._parent.workSpace.uri.fsPath)) {
                description = '.' + this._fullPath.substring(this._parent.workSpace.uri.fsPath.length);
                this.tooltip = 'Severity: ' + SeverityUtils.getString(this._severity) + '\nPath: ' + this._fullPath;
            }

            this.description = description;
        }
    }

    public apply() {
        this.label = this._name;
        this.applyDescription(false);
    }

    public get name(): string {
        return this._name;
    }
    public set name(value: string) {
        this._name = value;
    }

    public get timeStamp(): number | undefined {
        return this._timeStamp;
    }
    public set timeStamp(value: number | undefined) {
        this._timeStamp = value;
    }

    public get parent(): IssuesRootTreeNode | undefined {
        return this._parent;
    }
    public set parent(value: IssuesRootTreeNode | undefined) {
        this._parent = value;
        // this.setDescription(false);
    }

    public get severity(): Severity {
        return this._severity;
    }

    public set severity(value: Severity) {
        this._severity = value;
    }

    public get fullPath(): string {
        return this._fullPath;
    }

    public set fullPath(value: string) {
        this._fullPath = value;
        // this.setDescription(false);
    }
}
