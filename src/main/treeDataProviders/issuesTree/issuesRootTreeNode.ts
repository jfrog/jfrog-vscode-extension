import * as vscode from 'vscode';
import { Utils } from '../utils/utils';
import { BaseFileTreeNode } from './baseFileTreeNode';

// Root for opened workspace Path
export class IssuesRootTreeNode extends vscode.TreeItem {

    private _children: BaseFileTreeNode[] = [];
    private _lastScanTimestamp: number | undefined;

    constructor(
            private readonly _workSpace: vscode.WorkspaceFolder,
            _lastScanTimestamp?: number,
            collapsibleState?: vscode.TreeItemCollapsibleState
        ) {
        super(_workSpace.name , collapsibleState ?? vscode.TreeItemCollapsibleState.Collapsed);

        this.lastScanTimestamp = _lastScanTimestamp;
    }

    public get workSpace(): vscode.WorkspaceFolder {
        return this._workSpace;
    }

    public get children(): BaseFileTreeNode[] {
        return this._children;
    }

    public get lastScanTimestamp(): number | undefined {
        return this._lastScanTimestamp;
    }

    public set lastScanTimestamp(value: number | undefined) {
        this.tooltip = "Workspace '" + this._workSpace.name + "'\npath: '" + this._workSpace.uri.fsPath + "'\n";

        if(value == undefined) {
            this.description = "[No scan]";
            this.tooltip += "[No Scan]'";
        } else {
            let timeStampStr: string = Utils.getLastScanString(value);//IssuesRootTreeNode.timeStampMsg(value);//"scan completed at '" + new Date(Date.now()).toUTCString() + "'";
            this.description = timeStampStr ;
            this.tooltip += "Last " + timeStampStr;
        }

        this._lastScanTimestamp = value;
    }

    public static timeStampMsg(_lastScanTimestamp: number) {
        return "scan completed at '" + Utils.toDate(_lastScanTimestamp) + "'";
    }

    public addChildAndApply(child: BaseFileTreeNode) {
        this._children.push(child);
        this.apply();
    }

    public apply() {
        this._children
            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);
    }

   

    
}