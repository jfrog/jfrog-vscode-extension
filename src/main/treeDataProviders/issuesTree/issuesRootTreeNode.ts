import * as vscode from 'vscode';
import { Utils } from '../utils/utils';
import { BaseFileTreeNode } from './baseFileTreeNode';

// Root for opened workspace Path
export class IssuesRootTreeNode extends vscode.TreeItem {
    private _children: BaseFileTreeNode[] = [];
    public test: number = 0;
    constructor(
        private readonly _workSpace: vscode.WorkspaceFolder,
        _title?: string,
        private _oldestScanTimestamp?: number,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(_workSpace.name, collapsibleState ?? vscode.TreeItemCollapsibleState.Expanded);
        this.title = _title;
    }

    public get workSpace(): vscode.WorkspaceFolder {
        return this._workSpace;
    }

    public get children(): BaseFileTreeNode[] {
        return this._children;
    }

    public get oldestScanTimestamp(): number | undefined {
        return this._oldestScanTimestamp;
    }

    // public static timeStampMsg(_lastScanTimestamp: number) {
    //     return "scan completed at '" + Utils.toDate(_lastScanTimestamp) + "'";
    // }

    public set title(lbl: string | undefined) {
        this.description = lbl;
    }

    public get title(): string | undefined {
        if (this.description == false || this.description == true) {
            return undefined;
        }
        return this.description;
    }

    public addChild(child?: BaseFileTreeNode): BaseFileTreeNode | undefined {
        if (child) {
            this._children.push(child);
            child.parent = this;
        }
        return child;
    }

    public addChildAndApply(child?: BaseFileTreeNode): BaseFileTreeNode | undefined {
        if (this.addChild(child)) {
            this.apply();
        }
        return child;
    }

    public apply() {
        let oldestTimeStamp: number | undefined;
        for (let child of this.children) {
            child.apply();
            let timeStamp: number | undefined = child.timeStamp;
            if (timeStamp && (!oldestTimeStamp || timeStamp < oldestTimeStamp)) {
                oldestTimeStamp = timeStamp;
            }
        }
        this._oldestScanTimestamp = oldestTimeStamp;

        this.tooltip = "Workspace '" + this._workSpace.name + "'\n";
        // this.title = undefined;
        if (oldestTimeStamp) {
            this.tooltip += Utils.getLastScanString(oldestTimeStamp) + '\n';
        }
        this.tooltip += "path: '" + this._workSpace.uri.fsPath + "'";

        this._children
            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);
    }
}
