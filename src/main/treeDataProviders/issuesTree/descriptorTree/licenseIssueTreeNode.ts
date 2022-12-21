import * as vscode from 'vscode';
import { IGraphLicense, IViolation } from 'jfrog-client-js';
import { IssueTreeNode } from '../issueTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';
import { IDependencyPage, IImpactedPath, IReference } from 'jfrog-ide-webview';
import { Translators } from '../../../utils/translators';

import { Severity, SeverityUtils } from '../../../types/severity';
import { PackageType } from '../../../types/projectType';

/**
 * Describes an Xray license violation issue
 */
export class LicenseIssueTreeNode extends IssueTreeNode {
    private _references: IReference[];
    private _licenseissue: IGraphLicense;

    constructor(issue: IViolation, _severity: Severity, private _parent: DependencyIssuesTreeNode, private _impactedTreeRoot?: IImpactedPath) {
        super(issue.issue_id, _severity, issue.license_key, vscode.TreeItemCollapsibleState.None);

        this._watchNames = [issue.watch_name];
        this._references = Translators.cleanReferencesLink(issue.references);
        this._licenseissue = issue;
    }

    /**
     * Get the dependency details page data for this issue
     * @returns IDependencyPage with the data of this issue
     */
    public getDetailsPage(): IDependencyPage {
        return {
            id: this._issue_id,
            name: this._parent.name,
            watchName: this.watchNames?.join(', '),
            type: PackageType[this._parent.type],
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

    public get impactedTree(): IImpactedPath | undefined {
        return this._impactedTreeRoot;
    }

    public get parent(): DependencyIssuesTreeNode {
        return this._parent;
    }

    public get issue(): IGraphLicense {
        return this._licenseissue;
    }
}
