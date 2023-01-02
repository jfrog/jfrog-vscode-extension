import * as vscode from 'vscode';
import { IGraphCve, IViolation, IVulnerability } from 'jfrog-client-js';
import { IDependencyPage, IImpactedPath, IReference, IExtendedInformation, IApplicableDetails } from 'jfrog-ide-webview';
import { PackageType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { Translators } from '../../../utils/translators';
import { IssueTreeNode } from '../issueTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';

/**
 * Describes an Xray CVE vulnerability/violation issue
 */
export class CveTreeNode extends IssueTreeNode {
    private _edited: string;
    private _summary: string;
    private _references: IReference[];
    private _researchInfo?: IExtendedInformation;

    private _applicableDetails?: IApplicableDetails;

    constructor(
        sourceVul: IVulnerability | IViolation,
        severity: Severity,
        private _parent: DependencyIssuesTreeNode,
        private _impactedTreeRoot?: IImpactedPath,
        private _cve?: IGraphCve
    ) {
        super(sourceVul.issue_id, severity, _cve && _cve.cve ? _cve.cve : sourceVul.issue_id, vscode.TreeItemCollapsibleState.None);
        this._summary = sourceVul.summary;
        this._references = Translators.cleanReferencesLink(sourceVul.references);
        if (sourceVul.extended_information) {
            this._researchInfo = Translators.toWebViewExtendedInformation(sourceVul.extended_information);
        }

        let violation: IViolation = <IViolation>sourceVul;
        this._edited = sourceVul.edited ?? violation.updated;
        if (violation && violation.watch_name) {
            this._watchNames = [violation.watch_name];
        }
    }

    public get labelId(): string {
        return this._cve && this._cve.cve ? this._cve.cve : this.issue_id;
    }

    public get applicableDetails(): IApplicableDetails | undefined {
        return this._applicableDetails;
    }

    public set applicableDetails(value: IApplicableDetails | undefined) {
        this._applicableDetails = value;
    }

    /**
     * Get the dependency details page data for this issue
     * @returns IDependencyPage with the data of this issue
     */
    public getDetailsPage(): IDependencyPage {
        return {
            id: this._issue_id,
            cve: Translators.toWebViewICve(this.cve, this._applicableDetails),
            component: this._parent.name,
            watchName: this._watchNames.length > 0 ? this.watchNames : undefined,
            type: PackageType[this._parent.type],
            version: this._parent.version,
            infectedVersion: this.parent.infectedVersions,
            severity: SeverityUtils.toWebviewSeverity(this._severity),
            edited: this._edited,
            summary: this._summary,
            fixedVersion: this._parent.fixVersion,
            license: this.parent.licenses,
            references: this._references,
            extendedInformation: this._researchInfo,
            impactedPath: this.impactedTree
        } as IDependencyPage;
    }

    public get issue_id(): string {
        return this._issue_id;
    }

    public get impactedTree(): IImpactedPath | undefined {
        return this._impactedTreeRoot;
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
}
