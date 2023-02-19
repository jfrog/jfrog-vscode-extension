import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { ContextKeys } from '../../constants/contextKeys';
import { GeneralInfo } from '../../types/generalInfo';
import { IIssueKey } from '../../types/issueKey';
import { ILicenseKey } from '../../types/licenseKey';
import { Severity } from '../../types/severity';
import { IconsPaths } from '../../utils/iconsPaths';

export class DependenciesTreeNode extends vscode.TreeItem {
    private _children: DependenciesTreeNode[] = [];
    private _licenses: Set<ILicenseKey> = new Set(license => license.licenseName);
    private _issues: Set<IIssueKey> = new Set(issue => issue.issue_id);
    private _topSeverity: Severity;
    private _dependencyId: string = this._generalInfo.artifactId;

    constructor(
        protected _generalInfo: GeneralInfo,
        collapsibleState?: vscode.TreeItemCollapsibleState,
        private _parent?: DependenciesTreeNode,
        contextValue?: string
    ) {
        super(_generalInfo.artifactId, collapsibleState);
        this._topSeverity = Severity.Normal;
        this.iconPath = IconsPaths.NORMAL_SEVERITY;
        this.description = this.generalInfo.version;
        this.tooltip = this.componentId;
        if (contextValue === undefined) {
            this.contextValue = ContextKeys.SHOW_IN_PROJECT_DESC_ENABLED;
        }
        this.contextValue += ContextKeys.COPY_TO_CLIPBOARD_ENABLED;
        if (_parent && !_parent.children.find(child => child.componentId == this.componentId)) {
            _parent.children.push(this);
        }
    }

    public get dependencyId(): string {
        return this._dependencyId;
    }

    public set dependencyId(value: string) {
        this._dependencyId = value;
    }

    public get componentId(): string {
        return this.generalInfo.getComponentId();
    }

    public get generalInfo(): GeneralInfo {
        return this._generalInfo;
    }

    public set generalInfo(generalInfo: GeneralInfo) {
        this._generalInfo = generalInfo;
        this.description = this.generalInfo.version;
        this.tooltip = this.componentId;
    }

    public get parent(): DependenciesTreeNode | undefined {
        return this._parent;
    }

    public set parent(parent: DependenciesTreeNode | undefined) {
        this._parent = parent;
    }

    /**
     * Getter licenses
     * @return {Set<License>}
     */
    public get licenses(): Set<ILicenseKey> {
        return this._licenses;
    }

    public set licenses(value: Set<ILicenseKey>) {
        this._licenses = value;
    }

    public get issues(): Set<IIssueKey> {
        return this._issues;
    }

    public set issues(value: Set<IIssueKey>) {
        this._issues = value;
    }

    public get children(): DependenciesTreeNode[] {
        return this._children;
    }

    public set children(value: DependenciesTreeNode[]) {
        this._children = value;
    }

    public get topSeverity(): Severity {
        return this._topSeverity;
    }

    public set topSeverity(severity: Severity) {
        this._topSeverity = severity;
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
        this.fillShallowClone(clone);
        return clone;
    }

    public processTreeIssues(): Set<IIssueKey> {
        this.setIssuesComponent();
        this.children.forEach(child => {
            this.issues.union(child.processTreeIssues());
            this.setTopSeverity(child);
        });
        this.sortChildren();
        return this.issues;
    }

    protected fillShallowClone(clone: DependenciesTreeNode) {
        clone.label = this.label;
        clone.licenses = this.licenses;
        clone.issues = this.issues;
        clone.topSeverity = this.topSeverity;
        clone.contextValue = this.contextValue;
    }

    private setIssuesComponent() {
        this.issues.forEach(issue => {
            issue.component = this.componentId;
        });
    }

    private setTopSeverity(child: DependenciesTreeNode) {
        if (child.topSeverity > this.topSeverity) {
            this._topSeverity = child.topSeverity;
        }
    }

    public getViolatedLicenses(): Map<string, Set<string>> {
        let violatedLicenses: Map<string, Set<string>> = new Map();
        this.recursivelySetViolatedLicenses(violatedLicenses);
        return violatedLicenses;
    }

    private recursivelySetViolatedLicenses(violatedLicenses: Map<string, Set<string>>) {
        this.licenses.forEach(licenseKey => {
            if (licenseKey.violated) {
                let components: Set<string> | undefined = violatedLicenses.get(licenseKey.licenseName);
                if (!components) {
                    components = new Set<string>();
                }
                components.add(this.componentId);
                violatedLicenses.set(licenseKey.licenseName, components);
            }
        });
        this._children.forEach(child => {
            child.recursivelySetViolatedLicenses(violatedLicenses);
        });
    }

    private sortChildren() {
        this.children
            // 3rd priority - Sort by number of issues
            .sort((lhs, rhs) => lhs.issues.size() - rhs.issues.size())

            // 2nd priority - Sort by number of children
            .sort((lhs, rhs) => rhs.children.length - lhs.children.length)

            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.topSeverity - lhs.topSeverity);
    }

    public getChildByPath(path: string): DependenciesTreeNode | undefined {
        return this.children.find(child => child._generalInfo.path === path);
    }
}
