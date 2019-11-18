import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { GeneralInfo } from '../../types/generalInfo';
import { Issue } from '../../types/issue';
import { License } from '../../types/license';
import { Severity } from '../../types/severity';
import { IconsPaths } from '../../utils/iconsPaths';

export class DependenciesTreeNode extends vscode.TreeItem {
    private _children: DependenciesTreeNode[] = [];
    private _licenses: Collections.Set<License> = new Collections.Set(license => license.fullName);
    private _issues: Collections.Set<Issue> = new Collections.Set(issue => issue.summary);
    private _topIssue: Issue;

    constructor(private _generalInfo: GeneralInfo, collapsibleState?: vscode.TreeItemCollapsibleState, private _parent?: DependenciesTreeNode) {
        super(_generalInfo.artifactId, collapsibleState);
        this._topIssue = new Issue('', Severity.Normal, '', '');
        this.iconPath = IconsPaths.NORMAL_SEVERITY;
        if (_parent) {
            _parent.children.push(this);
        }
    }

    get tooltip(): string {
        return this.componentId;
    }

    get description(): string {
        return this.generalInfo.version;
    }

    public get componentId(): string {
        return this.generalInfo.artifactId + ':' + this.generalInfo.version;
    }

    public get generalInfo() {
        return this._generalInfo;
    }

    public get parent(): DependenciesTreeNode | undefined {
        return this._parent;
    }

    /**
     * Getter licenses
     * @return {Collections.Set<License>}
     */
    public get licenses(): Collections.Set<License> {
        return this._licenses;
    }

    public get issues(): Collections.Set<Issue> {
        return this._issues;
    }

    public set licenses(value: Collections.Set<License>) {
        this._licenses = value;
    }

    public set issues(value: Collections.Set<Issue>) {
        this._issues = value;
    }

    public get children(): DependenciesTreeNode[] {
        return this._children;
    }

    public set children(value: DependenciesTreeNode[]) {
        this._children = value;
    }

    public get topIssue(): Issue {
        return this._topIssue;
    }

    public set topIssue(value: Issue) {
        this._topIssue = value;
    }

    public set generalInfo(generalInfo: GeneralInfo) {
        this._generalInfo = generalInfo;
    }

    public set parent(parent: DependenciesTreeNode | undefined) {
        this._parent = parent;
    }

    public isDependenciesTreeRoot(): boolean {
        return !!this.generalInfo.path;
    }

    public addChild(child: DependenciesTreeNode) {
        this.children.push(child);
        child.parent = this;
    }

    public shallowClone(): DependenciesTreeNode {
        let clone: DependenciesTreeNode = new DependenciesTreeNode(this.generalInfo, this.collapsibleState);
        clone.licenses = this.licenses;
        clone.issues = this.issues;
        clone.topIssue = this.topIssue;
        return clone;
    }

    public processTreeIssues(): Collections.Set<Issue> {
        this.setIssuesComponent();
        this.children.forEach(child => this.issues.union(child.processTreeIssues()));
        this.setTopIssue();
        this.sortChildren();
        return this.issues;
    }

    private getComponentId(): string {
        return this.generalInfo.artifactId + ':' + this.generalInfo.version;
    }

    private setIssuesComponent() {
        this.issues.forEach(issue => {
            issue.component = this.getComponentId();
        });
    }

    private setTopIssue() {
        this.issues.forEach(issue => {
            if (this._topIssue.severity < issue.severity) {
                this._topIssue = issue;
            }
        });
    }

    private sortChildren() {
        this.children
            // 3rd priority - Sort by number of issues
            .sort((lhs, rhs) => lhs.issues.size() - rhs.issues.size())

            // 2nd priority - Sort by number of children
            .sort((lhs, rhs) => rhs.children.length - lhs.children.length)

            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.topIssue.severity - lhs.topIssue.severity);
    }
}
