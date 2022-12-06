
import * as vscode from 'vscode';
import { PackageType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { CveTreeNode } from './cveTreeNode';
import { DescriptorTreeNode } from './descriptorTreeNode';

export class IssueDependencyTreeNode extends vscode.TreeItem {
    
    private _issues: CveTreeNode[] = [];

    constructor(
        private _artifactId: string,
        private _name: string,
        private _version: string,
        private _type: PackageType,
        private _topSeverity: Severity,
        private _parent: DescriptorTreeNode,
        // private _parent?: ProjectRootTreeNode,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(_name, collapsibleState ?? vscode.TreeItemCollapsibleState.Collapsed);
        this.description = _version;
    }

    public sortIssues() {
        this.tooltip = "Severity: " + SeverityUtils.getString(this.topSeverity) + "\nIssues count: " + this._issues.length + "\nArtifact: " + this.artifactId + "";

        this._issues
        // 2nd priority - Sort by name
        .sort((lhs, rhs) => rhs.severity - lhs.severity)
        // 1st priority - Sort by severity
        .sort((lhs, rhs) => rhs.severity - lhs.severity);
    }

    public get artifactId(): string {
        return this._artifactId;
    }

    public set issues(value: CveTreeNode[]) {
        this._issues = value;
    }

    public get issues(): CveTreeNode[] {
        return this._issues;
    }

    public get parent(): DescriptorTreeNode {
        return this._parent;
    }

    public set topSeverity(value: Severity) {
        this._topSeverity = value;
    }

    public get topSeverity(): Severity {
        return this._topSeverity;
    }

    public get name(): string {
        return this._name;
    }

    public get version(): string {
        return this._version;
    }

    public get type(): PackageType {
        return this._type;
    }
}