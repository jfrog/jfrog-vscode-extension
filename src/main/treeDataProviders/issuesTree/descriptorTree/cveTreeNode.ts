// import { ISeverityReasons } from 'jfrog-client-js';
import { IGraphCve, IResearch, IVulnerability } from 'jfrog-client-js';
import { /*ICve,*/ ICve, IDependencyPage, IReference /*IResearch, ISeverity */ } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { PackageType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { IssueNode } from '../../issuesDataProvider';
import { DependencyIssueTreeNode } from './dependencyIssueTreeNode';

export class CveTreeNode extends IssueNode {
    private _id: string;
    private _edited: string;
    private _summary: string;
    private _references: string[];
    private _researchInfo?: IResearch;

    constructor(sourceVul: IVulnerability, private _severity: Severity, private _parent: DependencyIssueTreeNode, private _cve?: IGraphCve) {
        super(_cve && _cve.cve ? _cve.cve : sourceVul.issue_id, vscode.TreeItemCollapsibleState.None);
        this._id = sourceVul.issue_id;
        this._edited = sourceVul.edited;
        this._summary = sourceVul.summary;
        this._references = sourceVul.references;
        if (sourceVul.researchInfo) {
            this._researchInfo = sourceVul.researchInfo;
        }
    }

    public get references(): string[] {
        return this._references;
    }
    public set references(value: string[]) {
        this._references = value;
    }

    public get cve(): IGraphCve | undefined {
        return this._cve;
    }

    public get severity(): Severity {
        return this._severity;
    }

    public get parent(): DependencyIssueTreeNode {
        return this._parent;
    }

    public asDetailsPage(): IDependencyPage {
        return {
            id: this._id, // tell or that the ID is not right, the CVE name appear as id and the XRAY is the title
            cve: this._cve
                ? ({
                      id: this._cve.cve,
                      cvssV2Score: this._cve.cvss_v2_score,
                      cvssV2Vector: this._cve.cvss_v2_vector,
                      cvssV3Score: this._cve.cvss_v3_score,
                      cvssV3Vector: this._cve.cvss_v3_vector,
                      applicably: true // TODO: change when adding scan
                  } as ICve)
                : ({ applicably: true } as ICve), //undefined,
            name: this._parent.name,
            type: PackageType[this._parent.type],
            version: this._parent.version,
            // infectedVersion: this.parent , // ["infectedVersion"] // TODO: add in client-js
            severity: SeverityUtils.toWebviewSeverity(this._severity),
            edited: this._edited,
            summary: this._summary,
            fixedVersion: this._parent.fixVersion,
            license: this.parent.licenses.length >= 0 ? this.parent.licenses.map(l => l.name).join() : undefined, // TODO: tell or about only one when can be multiple
            references: this._references.map(refrence => ({ url: refrence } as IReference)), // TODO: tell or that there are no text...
            researchInfo: this._researchInfo,
            impactedPath: this._parent.impactedTree
        } as IDependencyPage;
    }
}
