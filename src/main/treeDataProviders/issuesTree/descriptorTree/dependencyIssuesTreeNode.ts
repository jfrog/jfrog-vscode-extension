import * as vscode from 'vscode';
import { ILicense } from 'jfrog-ide-webview';
import { PackageType, toPackgeType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { DescriptorTreeNode } from './descriptorTreeNode';
import { IComponent } from 'jfrog-client-js';
import { IssueTreeNode } from '../issueTreeNode';

export class DependencyIssuesTreeNode extends vscode.TreeItem {
    // Infer from data
    private _name: string;
    private _version: string;
    private _fixVersion: string[];
    private _type: PackageType;
    private _infectedVersions: string[];

    // Added dynamicly
    private _issues: IssueTreeNode[] = [];
    private _licenses: ILicense[] = [];

    constructor(private _artifactId: string, component: IComponent, private _topSeverity: Severity, private _parent: DescriptorTreeNode) {
        super(component.package_name);

        this._name = component.package_name;
        this._version = component.package_version;
        this._fixVersion = component.fixed_versions;
        this._infectedVersions = component.infected_versions;
        this._type = toPackgeType(component.package_type);

        this.description = this._version;
    }

    /**
     * Apply all the changes to this object and its children, This method should be called after evrey set of changes to this object or its children.
     * Use to calculate accumulative statistics and view from all the children.
     */
    public apply() {
        this.tooltip = 'Top severity: ' + SeverityUtils.getString(this.topSeverity) + '\n';
        this.tooltip += 'Issues count: ' + this._issues.length + '\n';
        this.tooltip += 'Artifact: ' + this.artifactId;

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

    /**
     * return a string that identify this dependency [type,name,version]
     */
    public get artifactId(): string {
        return this._artifactId;
    }

    /**
     * return a string that identify this dependency [name,version]
     */
    public get componenetId(): string {
        return this._name + ':' + this._version;
    }

    public get infectedVersions(): string[] {
        return this._infectedVersions;
    }

    public get licenses(): ILicense[] {
        return this._licenses;
    }

    public set licenses(value: ILicense[]) {
        this._licenses = value;
    }

    public set issues(value: IssueTreeNode[]) {
        this._issues = value;
    }

    public get issues(): IssueTreeNode[] {
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
