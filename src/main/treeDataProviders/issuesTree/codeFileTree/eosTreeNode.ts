import { IAnalysisStep, IEosPage, PageType } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { EosIssue, EosIssueLocation } from '../../../scanLogic/scanRunners/eosScan';
import { SeverityUtils } from '../../../types/severity';
import { Translators } from '../../../utils/translators';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';

/**
 * Describe a Eos issue
 */
export class EosTreeNode extends CodeIssueTreeNode {
    private _codeFlows: IAnalysisStep[][];

    private _fullDescription?: string;
    private _snippet?: string;

    constructor(issue: EosIssue, location: EosIssueLocation, parent: CodeFileTreeNode) {
        super(
            issue.ruleId,
            parent,
            new vscode.Range(
                new vscode.Position(location.region.startLine, location.region.startColumn),
                new vscode.Position(location.region.endLine, location.region.endColumn)
            ),
            issue.severity,
            issue.ruleName
        );
        this._snippet = location.region.snippet?.text;
        this._fullDescription = issue.fullDescription;
        this._codeFlows = Translators.toAnalysisSteps(location.threadFlows);
    }

    public get codeFlows(): IAnalysisStep[][] {
        return this._codeFlows;
    }

    public get snippet(): string | undefined {
        return this._snippet;
    }

    /**
     * Get the CVE details page of the issue
     */
    public getDetailsPage(): IEosPage {
        return {
            header: this.label,
            severity: SeverityUtils.toWebviewSeverity(this.severity),
            pageType: PageType.Eos,
            location: {
                file: this.parent.fullPath,
                snippet: this._snippet,
                row: this.regionWithIssue.start.line + 1,
                column: this.regionWithIssue.start.character
            } as IAnalysisStep,
            description: this._fullDescription,
            analysisStep: this._codeFlows.length > 0 ? this._codeFlows[0] : undefined
        } as IEosPage;
    }
}
