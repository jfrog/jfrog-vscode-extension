import * as vscode from 'vscode';
import { IGraphLicense, IViolation } from 'jfrog-client-js';
import { IssueTreeNode } from '../issueTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';
import { IDependencyPage, IImpactedPath, IReference } from 'jfrog-ide-webview';
import { Translators } from '../../../utils/translators';

import { Severity, SeverityUtils } from '../../../types/severity';
import { PackageType } from '../../../types/projectType';
import { ContextKeys } from '../../../constants/contextKeys';
import { PageType } from 'jfrog-ide-webview';

/**
 * Describes an Xray license violation issue
 */
export class LicenseIssueTreeNode extends IssueTreeNode {
    private _references: IReference[];
    private _licenseIssue: IGraphLicense;
    private _ignoreUrl: string;

    constructor(issue: IViolation, _severity: Severity, private _parent: DependencyIssuesTreeNode, private _impactedTreeRoot: IImpactedPath) {
        super(issue.issue_id, _severity, issue.license_key, vscode.TreeItemCollapsibleState.None);

        this._watchNames = [issue.watch_name];
        this._references = Translators.cleanReferencesLink(issue.references);
        this._licenseIssue = issue;

        this.description = 'License violation';
        this.tooltip = 'License violation issue';

        this.contextValue += ContextKeys.SHOW_IGNORE_RULE_ENABLED;
        this._ignoreUrl = issue.ignore_url;
    }

    /**
     * Get the dependency details page data for this issue
     * @returns IDependencyPage with the data of this issue
     */
    public getDetailsPage(): IDependencyPage {
        return {
            id: this._issue_id,
            pageType: PageType.Dependency,
            component: this._parent.name,
            watchName: this.watchNames,
            componentType: PackageType[this._parent.type],
            version: this._parent.version,
            severity: SeverityUtils.toWebviewSeverity(this._severity),
            license: this.parent.licenses,
            references: this._references,
            impactedPath: this.impactedTree
        } as IDependencyPage;
    }

    public get issue_id(): string {
        return this._issue_id;
    }

    public get ignoreUrl(): string {
        return this._ignoreUrl;
    }

    public get impactedTree(): IImpactedPath {
        return this._impactedTreeRoot;
    }

    public get parent(): DependencyIssuesTreeNode {
        return this._parent;
    }

    public get issue(): IGraphLicense {
        return this._licenseIssue;
    }
}
