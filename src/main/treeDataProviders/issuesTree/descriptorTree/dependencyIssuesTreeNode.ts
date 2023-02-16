import * as vscode from 'vscode';
import { ILicense } from 'jfrog-ide-webview';
import { PackageType, toPackageType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { IComponent } from 'jfrog-client-js';
import { CveTreeNode } from './cveTreeNode';
import { LicenseIssueTreeNode } from './licenseIssueTreeNode';
import { ContextKeys } from '../../../constants/contextKeys';
import { ProjectDependencyTreeNode } from './projectDependencyTreeNode';

export class DependencyIssuesTreeNode extends vscode.TreeItem {
    // Infer from data
    private _name: string;
    private _version: string;
    private _type: PackageType;
    private _severity: Severity = Severity.Unknown;

    // Added dynamically
    private _issues: (CveTreeNode | LicenseIssueTreeNode)[] = [];
    private _licenses: ILicense[] = [];

    constructor(private _artifactId: string, component: IComponent, private _indirect: boolean, private _parent: ProjectDependencyTreeNode) {
        super(component.package_name);

        this._name = component.package_name;
        this._version = component.package_version;
        this._type = toPackageType(component.package_type);
        this.description = this._version + (_indirect ? ' (indirect)' : '');
        this.contextValue += ContextKeys.COPY_TO_CLIPBOARD_ENABLED;
    }

    /**
     * Apply all the changes to this object and its children, This method should be called after every set of changes to this object or its children.
     * Use to calculate accumulative statistics and view from all the children.
     */
    public apply() {
        // Set collapsible state and severity base on children count
        if (this.issues.length == 1 && this.parent.dependenciesWithIssue.length == 1) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
        let topSeverity: Severity = this.issues.length > 0 ? Severity.NotApplicableUnknown : Severity.Unknown;
        for (const issue of this.issues) {
            if (topSeverity < issue.severity) {
                topSeverity = issue.severity;
            }
        }
        this._severity = topSeverity;

        this.tooltip = 'Top severity: ' + SeverityUtils.getString(this.severity) + '\n';
        this.tooltip += 'Issues count: ' + this._issues.length + '\n';
        this.tooltip += 'Artifact' + (this._indirect ? ' (indirect):' : ':') + '\n' + this.artifactId;
        this.description = this._version + (this._indirect ? ' (indirect)' : '');
        this._issues
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
     * return a string that identify this component in the format: name:version
     */
    public get componentId(): string {
        return this._name + ':' + this._version;
    }

    public get indirect(): boolean {
        return this._indirect;
    }

    public get licenses(): ILicense[] {
        return this._licenses;
    }

    public set licenses(value: ILicense[]) {
        this._licenses = value;
    }

    public set issues(value: (CveTreeNode | LicenseIssueTreeNode)[]) {
        this._issues = value;
    }

    public get issues(): (CveTreeNode | LicenseIssueTreeNode)[] {
        return this._issues;
    }

    public getCveIssues(): CveTreeNode[] {
        let cveTreeNodes: CveTreeNode[] = [];
        this._issues.forEach(issue => {
            if (issue instanceof CveTreeNode) {
                cveTreeNodes.push(issue);
            }
        });
        return cveTreeNodes;
    }

    public get parent(): ProjectDependencyTreeNode {
        return this._parent;
    }

    public get severity(): Severity {
        return this._severity;
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

    /**
     * @returns the file system path to the project descriptor directory or to the Python virtual environment
     */
    public getSourcePath(): string {
        return this.parent.getProjectPath();
    }

    public getFixedVersionToCves() {
        const versionToCves: Map<string, Set<string>> = new Map<string, Set<string>>();
        this.getCveIssues().forEach((issue: CveTreeNode) => {
            issue.fixedVersions?.forEach((fixedVersion: string) => {
                const cve: string = issue.cve?.cve || issue.issueId;
                const cves: Set<string> | undefined = versionToCves.get(fixedVersion);
                if (cves) {
                    cves.add(cve);
                } else {
                    versionToCves.set(
                        fixedVersion,
                        new Set<string>([cve])
                    );
                }
            });
        });
        return new Map([...versionToCves].sort());
    }
}
