import * as vscode from 'vscode';
import { IGraphLicense, IViolation } from 'jfrog-client-js';
import { IssueTreeNode } from '../issueTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssueTreeNode';
import { IDependencyPage, ILicense, IReference } from 'jfrog-ide-webview';
import { Translators } from '../../../utils/translators';

import { Severity, SeverityUtils } from '../../../types/severity';
import { PackageType } from '../../../types/projectType';

export class LicenseIssueTreeNode extends IssueTreeNode {
    private _id: string;
    private _references: IReference[];
    private _watchName: string;

    private _licenseissue: IGraphLicense;

    constructor(issue: IViolation, _severity: Severity, private _parent: DependencyIssuesTreeNode) {
        super(_severity, issue.license_key, vscode.TreeItemCollapsibleState.None);

        this._id = issue.issue_id;

        this._watchName = issue.watch_name;
        this._references = Translators.cleanReferencesLink(issue.references);
        this._licenseissue = issue;
    }

    public get parent(): DependencyIssuesTreeNode {
        return this._parent;
    }

    public get issue(): IGraphLicense {
        return this._licenseissue;
    }

    public get watchName(): string {
        return this._watchName;
    }

    public getDetailsPage(): IDependencyPage {
        return {
            id: this._id,
            name: this._parent.name,
            watchName: this.watchName,
            type: PackageType[this._parent.type],
            version: this._parent.version,
            severity: SeverityUtils.toWebviewSeverity(this._severity),
            license: this.parent.licenses.length >= 0 ? ({ name: this.parent.licenses.map(l => l.name).join(', ') } as ILicense) : undefined, // TODO: tell or about only one when can be multiple
            references: this._references,
            impactedPath: this._parent.impactedTree
        } as IDependencyPage;
    }
}
