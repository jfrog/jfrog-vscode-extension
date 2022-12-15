// import { ISeverityReasons } from 'jfrog-client-js';
import { IGraphCve, IResearch, IViolation, IVulnerability } from 'jfrog-client-js';
import { /*ICve,*/ ICve, IDependencyPage, ILicense, IReference /*IResearch, ISeverity */ } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { PackageType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { Translators } from '../../../utils/translators';
import { IssueTreeNode } from '../issueTreeNode';
// import { IssueNode } from '../../issuesDataProvider';

import { DependencyIssuesTreeNode } from './dependencyIssueTreeNode';

export class CveTreeNode extends IssueTreeNode {
    private _id: string;
    private _edited: string;
    private _summary: string;
    private _references: IReference[];
    private _researchInfo?: IResearch;
    private _watchName?: string | undefined;

    // TODO: private _applicableData?: FileContentIssue[]; // undefined = not scan, empty => not applicable, each entry is applicable issue in a file

    constructor(sourceVul: IVulnerability | IViolation, _severity: Severity, private _parent: DependencyIssuesTreeNode, private _cve?: IGraphCve) {
        super(_severity, _cve && _cve.cve ? _cve.cve : sourceVul.issue_id, vscode.TreeItemCollapsibleState.None);
        this._id = sourceVul.issue_id;
        this._edited = sourceVul.edited;
        this._summary = sourceVul.summary;
        this._watchName = (<IViolation>sourceVul).watch_name;

        this._references = Translators.cleanReferencesLink(sourceVul.references);
        if (sourceVul.researchInfo) {
            this._researchInfo = sourceVul.researchInfo;
        }
    }

    public get watchName(): string | undefined {
        return this._watchName;
    }

    public get references(): IReference[] {
        return this._references;
    }
    public set references(value: IReference[]) {
        this._references = value;
    }

    public get cve(): IGraphCve | undefined {
        return this._cve;
    }

    public get parent(): DependencyIssuesTreeNode {
        return this._parent;
    }

    public getDetailsPage(): IDependencyPage {
        return {
            id: this._id,
            cve: this._cve
                ? ({
                      id: this._cve.cve,
                      cvssV2Score: this._cve.cvss_v2_score,
                      cvssV2Vector: this._cve.cvss_v2_vector,
                      cvssV3Score: this._cve.cvss_v3_score,
                      cvssV3Vector: this._cve.cvss_v3_vector,
                      applicably: true // TODO: change when adding scan to: this._applicableData && this._applicableData.length > 0
                  } as ICve)
                : ({ applicably: true } as ICve), //undefined, TODO: return undefined when adding applicable data
            name: this._parent.name,
            watchName: this.watchName,
            type: PackageType[this._parent.type],
            version: this._parent.version,
            // infectedVersion: this.parent , // ["infectedVersion"] // TODO: add in client-js
            severity: SeverityUtils.toWebviewSeverity(this._severity),
            edited: this._edited,
            summary: this._summary,
            fixedVersion: this._parent.fixVersion,
            license: this.parent.licenses.length >= 0 ? ({ name: this.parent.licenses.map(l => l.name).join(', ') } as ILicense) : undefined, // TODO: tell or about only one when can be multiple
            references: this._references, // TODO: tell or that there are no text...
            researchInfo: this._researchInfo,
            impactedPath: this._parent.impactedTree
        } as IDependencyPage;
    }
}
