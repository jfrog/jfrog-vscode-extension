import * as vscode from 'vscode';
import { Severity } from '../../types/severity';
import * as path from 'path';
import { SourceCodeCveTreeNode } from './sourceCodeCveNode';
import { SourceCodeRootTreeNode } from './sourceCodeRootTreeNode';
import { Utils } from '../utils/utils';

/**
 * Represent a file node containing CVEs in the CVE Applicability view.
 */
export class SourceCodeFileTreeNode extends vscode.TreeItem {
    private _topSeverity?: Severity;

    constructor(
        private _filePath: string,
        private _children: SourceCodeCveTreeNode[],
        private _parent?: SourceCodeRootTreeNode,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        // File node is named as its file name.
        super(Utils.getLastSegment(_filePath), collapsibleState ?? vscode.TreeItemCollapsibleState.Expanded);
        if (_parent) {
            _parent.children.push(this);
        }
        if (_filePath.indexOf(path.sep) !== -1) {
            this.description = _filePath;
        }
    }

    public static createFailedScanNode(): SourceCodeFileTreeNode {
        const node: SourceCodeFileTreeNode = new SourceCodeFileTreeNode('Fail to scan project', [], undefined, vscode.TreeItemCollapsibleState.None);
        node._topSeverity = Severity.Medium;
        return node;
    }

    public static createNoVulnerabilitiesFound(): SourceCodeFileTreeNode {
        const node: SourceCodeFileTreeNode = new SourceCodeFileTreeNode(
            'No code vulnerabilities were found',
            [],
            undefined,
            vscode.TreeItemCollapsibleState.None
        );
        node._topSeverity = Severity.Normal;
        return node;
    }

    public get parent(): SourceCodeRootTreeNode | undefined {
        return this._parent;
    }

    public set parent(value: SourceCodeRootTreeNode | undefined) {
        this._parent = value;
    }

    public get filePath(): string {
        return this._filePath;
    }

    public set filePath(value: string) {
        this._filePath = value;
    }

    public get children(): SourceCodeCveTreeNode[] {
        return this._children;
    }

    public set children(value: SourceCodeCveTreeNode[]) {
        this._children = value;
    }

    public get topSeverity(): Severity | undefined {
        for (const child of this._children) {
            if (this._topSeverity === undefined || (child.severity !== undefined && child.severity > this._topSeverity)) {
                this._topSeverity = child.severity;
            }
        }
        return this._topSeverity;
    }
}
