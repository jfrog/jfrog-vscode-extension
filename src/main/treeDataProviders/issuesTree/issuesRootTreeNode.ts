import * as vscode from 'vscode';
import { Utils } from '../utils/utils';
import { FileTreeNode } from './fileTreeNode';

/**
 * Describes a root node of workspace issues for the 'Issues' view.
 * Holds a list of files with xray issues
 */
export class IssuesRootTreeNode extends vscode.TreeItem {
    private _children: FileTreeNode[] = [];
    private _title: string = '';
    private _eosScanTimeStamp?: number | undefined;

    constructor(private readonly _workSpace: vscode.WorkspaceFolder, title?: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(_workSpace.name, collapsibleState ?? vscode.TreeItemCollapsibleState.Expanded);
        this.title = title ?? '';
    }

    /**
     * Apply all the changes to this object and its children, This method should be called after evrey set of changes to this object or its children.
     * Use to calculate accumulative statistics and view from all the children.
     * 1. Calls apply to each child to ensure data is calculated and not dirty.
     * 2. Calculate the oldest scan timestamp from all the files.
     * 3. Set the tooltip
     * 4. Sort children for view
     */
    public apply() {
        let issueCount: number = 0;
        for (let child of this.children) {
            child.apply();
            issueCount += child.issues.length;
        }

        this.tooltip = 'Issue count: ' + issueCount + '\n';
        this.tooltip += "Full Path: '" + this._workSpace.uri.fsPath + "'";
        if (this._title != '') {
            this.tooltip += '\nStatus: ' + this._title;
        } else if (this.oldestScanTimestamp) {
            this.tooltip += '\nLast ' + Utils.getLastScanString(this.oldestScanTimestamp);
        }

        this._children
            // 2nd priority - Sort by top issue count
            .sort((lhs, rhs) => rhs.issues.length - lhs.issues.length)
            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);
    }

    /**
     * Add new file with issues to this workspace and apply the changes
     * @param child - the file that will be added
     * @returns - the file that was added for chaining
     */
    public addChildAndApply(child?: FileTreeNode): FileTreeNode | undefined {
        if (this.addChild(child)) {
            this.apply();
        }
        return child;
    }

    /**
     * Add new file with issues to this workspace
     * @param child  - the file that will be added
     * @returns  - the file that was added for chaining
     */
    public addChild(child?: FileTreeNode): FileTreeNode | undefined {
        if (child) {
            this._children.push(child);
            child.parent = this;
        }
        return child;
    }

    public get eosScanTimeStamp(): number | undefined {
        return this._eosScanTimeStamp;
    }

    public set eosScanTimeStamp(value: number | undefined) {
        this._eosScanTimeStamp = value;
    }

    /**
     * Get the oldest timestamp from all its children
     */
    public get oldestScanTimestamp(): number | undefined {
        let oldestTimeStamp: number | undefined;
        for (let child of this.children) {
            let timeStamp: number | undefined = child.timeStamp;
            if (timeStamp && (!oldestTimeStamp || timeStamp < oldestTimeStamp)) {
                oldestTimeStamp = timeStamp;
            }
        }
        if (this._eosScanTimeStamp !== undefined) {
            if (oldestTimeStamp == undefined || this._eosScanTimeStamp < oldestTimeStamp) {
                oldestTimeStamp = this._eosScanTimeStamp;
            }
        }
        return oldestTimeStamp;
    }

    /**
     * Set the title of this root, will be shown as the description and will be used to derive information for the tooltip
     */
    public set title(val: string) {
        this._title = val;
        this.description = val;
    }

    public get workSpace(): vscode.WorkspaceFolder {
        return this._workSpace;
    }

    public get children(): FileTreeNode[] {
        return this._children;
    }
}
