import * as vscode from 'vscode';
import { Utils } from '../../utils/utils';
import { FileTreeNode } from './fileTreeNode';

/**
 * Describes a root node of workspace issues for the 'Issues' view.
 * Holds a list of files with xray issues
 */
export class IssuesRootTreeNode extends vscode.TreeItem {
    private _children: FileTreeNode[] = [];
    private _title: string = '';
    private _sastScanTimeStamp?: number | undefined;
    private _iacScanTimeStamp?: number | undefined;
    private _secretsScanTimeStamp?: number | undefined;

    constructor(private readonly _workspace: vscode.WorkspaceFolder, title?: string, collapsibleState?: vscode.TreeItemCollapsibleState) {
        super(_workspace.name, collapsibleState ?? vscode.TreeItemCollapsibleState.Expanded);
        this.title = title ?? '';
    }

    /**
     * Apply all the changes to this object and its children, This method should be called after every set of changes to this object or its children.
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
        this.tooltip += 'Full path: ' + this._workspace.uri.fsPath + '';
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

    public getFileTreeNode(file: string): FileTreeNode | undefined {
        return this._children.find(child => child.projectFilePath === file);
    }

    public get sastScanTimeStamp(): number | undefined {
        return this._sastScanTimeStamp;
    }

    public set sastScanTimeStamp(value: number | undefined) {
        this._sastScanTimeStamp = value;
    }

    public get iacScanTimeStamp(): number | undefined {
        return this._iacScanTimeStamp;
    }

    public set iacScanTimeStamp(value: number | undefined) {
        this._iacScanTimeStamp = value;
    }

    public get secretsScanTimeStamp(): number | undefined {
        return this._secretsScanTimeStamp;
    }

    public set secretsScanTimeStamp(value: number | undefined) {
        this._secretsScanTimeStamp = value;
    }

    /**
     * Get the oldest timestamp from all its children
     */
    public get oldestScanTimestamp(): number | undefined {
        return Utils.getOldestTimeStamp(
            ...this.children.map(file => file.timeStamp),
            this._iacScanTimeStamp,
            this._secretsScanTimeStamp,
            this._sastScanTimeStamp
        );
    }

    /**
     * Set the title of this root, will be shown as the description and will be used to derive information for the tooltip
     */
    public set title(val: string) {
        this._title = val;
        this.description = val;
    }

    public get workspace(): vscode.WorkspaceFolder {
        return this._workspace;
    }

    public get children(): FileTreeNode[] {
        return this._children;
    }
}
