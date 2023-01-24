import * as vscode from 'vscode';
import { IComponent, IGraphCve, IViolation, IVulnerability } from 'jfrog-client-js';
import { IDependencyPage, IImpactGraph, IReference, IExtendedInformation, IApplicableDetails, PageType } from 'jfrog-ide-webview';
import { PackageType } from '../../../types/projectType';
import { Severity, SeverityUtils } from '../../../types/severity';
import { Translators } from '../../../utils/translators';
import { IssueTreeNode } from '../issueTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';
import { ContextKeys } from '../../../constants/contextKeys';

/**
 * Describes an Xray CVE vulnerability/violation issue
 */
export class CveTreeNode extends IssueTreeNode {
    private _edited: string;
    private _summary: string;
    private _references: IReference[];
    private _researchInfo?: IExtendedInformation;

    private _fixedVersions: string[];
    private _infectedVersions: string[];

    private _ignoreUrl?: string | undefined;

    private _applicableDetails?: IApplicableDetails;

    constructor(
        sourceVul: IVulnerability | IViolation,
        severity: Severity,
        private _parent: DependencyIssuesTreeNode,
        component: IComponent,
        private _impactedTreeRoot?: IImpactGraph,
        private _cve?: IGraphCve
    ) {
        super(sourceVul.issue_id, severity, _cve && _cve.cve ? _cve.cve : sourceVul.issue_id, vscode.TreeItemCollapsibleState.None);
        this._summary = sourceVul.summary;
        this._references = Translators.cleanReferencesLink(sourceVul.references);
        if (sourceVul.extended_information) {
            this._researchInfo = Translators.toWebViewExtendedInformation(sourceVul.extended_information);
        }

        this._fixedVersions = component.fixed_versions;
        this._infectedVersions = component.infected_versions;

        let violation: IViolation = <IViolation>sourceVul;
        this._edited = sourceVul.edited ?? violation.updated;
        if (violation && violation.watch_name) {
            this._watchNames = [violation.watch_name];
        }
        if (violation && violation.ignore_url) {
            this.contextValue += ContextKeys.SHOW_IGNORE_RULE_ENABLED;
            this._ignoreUrl = violation.ignore_url;
        }
    }

    public get ignoreUrl(): string | undefined {
        return this._ignoreUrl;
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
            pageType: PageType.Dependency,
            cve: Translators.toWebViewICve(this.cve, this._applicableDetails),
            component: this._parent.name,
            watchName: this._watchNames.length > 0 ? this.watchNames : undefined,
            componentType: PackageType[this._parent.type],
            version: this._parent.version,
            infectedVersion: this._infectedVersions,
            severity: SeverityUtils.toWebviewSeverity(this._severity),
            edited: this._edited,
            summary: this._summary,
            fixedVersion: this._fixedVersions,
            license: this.parent.licenses,
            references: this._references,
            extendedInformation: this._researchInfo,
            impactGraph: this.impactedTree
        } as IDependencyPage;
    }

    public get issue_id(): string {
        return this._issue_id;
    }

    public get fixedVersions(): string[] {
        return this._fixedVersions;
    }

    public get infectedVersions(): string[] {
        return this._infectedVersions;
    }

    public get impactedTree(): IImpactGraph {
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
