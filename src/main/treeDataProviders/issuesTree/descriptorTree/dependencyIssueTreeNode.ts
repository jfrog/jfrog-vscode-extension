import { IImpactedPath, ILicense } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { PackageType, toPackgeType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { CveTreeNode } from './cveTreeNode';
import { DescriptorTreeNode } from './descriptorTreeNode';

import { IComponent /*, IImpactPath*/ } from 'jfrog-client-js';

export class DependencyIssuesTreeNode extends vscode.TreeItem {
    // infer from data
    private _name: string;
    private _version: string;
    private _fixVersion: string[];
    private _type: PackageType;
    // added dynamicly
    private _issues: CveTreeNode[] = [];
    private _licenses: ILicense[] = [];

    constructor(
        private _artifactId: string,
        component: IComponent,
        private _topSeverity: Severity,
        private _parent: DescriptorTreeNode,
        private _impactedTreeRoot?: IImpactedPath
    ) {
        super(component.package_name);

        this._name = component.package_name;
        this._version = component.package_version;
        this._fixVersion = component.fixed_versions;
        this._type = toPackgeType(component.package_type);
        // this._impactedTreeRoot = this.toImpactedfTree(component.impact_paths);

        this.description = this._version;
    }

    public apply() {
        this.tooltip =
            'Severity: ' +
            SeverityUtils.getString(this.topSeverity) +
            '\nIssues count: ' +
            this._issues.length +
            '\nArtifact: ' +
            this.artifactId +
            '';

        if (this.issues.length == 1 && this.parent.dependenciesWithIssue.length == 1) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }

        this._issues
            // 2nd priority - Sort by name
            .sort((lhs, rhs) => rhs.severity - lhs.severity)
            // 1st priority - Sort by severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);
    }

    public get componenetId(): string {
        return this._name + ":" + this._version;
    }

    public get impactedTree(): IImpactedPath | undefined {
        return this._impactedTreeRoot;
    }

    public get licenses(): ILicense[] {
        return this._licenses;
    }

    public set licenses(value: ILicense[]) {
        this._licenses = value;
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

    public get fixVersion(): string[] {
        return this._fixVersion;
    }

    public get version(): string {
        return this._version;
    }

    public get type(): PackageType {
        return this._type;
    }
}
