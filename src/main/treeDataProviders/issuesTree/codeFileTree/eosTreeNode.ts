import { IAnalysisStep, IEosPage, PageType } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { EosIssue, EosIssueLocation } from '../../../scanLogic/scanRunners/eosScan';
import { Severity } from '../../../types/severity';
import { Translators } from '../../../utils/translators';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';

/**
 * Describe a Eos issue
 */
export class EosTreeNode extends CodeIssueTreeNode {
    private _codeFlows: IAnalysisStep[][];

    private _fullDescription?: string;

    constructor(issue: EosIssue, location: EosIssueLocation, parent: CodeFileTreeNode, severity?: Severity) {
        super(
            issue.ruleId,
            parent,
            new vscode.Range(
                new vscode.Position(location.region.startLine, location.region.startColumn),
                new vscode.Position(location.region.endLine, location.region.endColumn)
            ),
            severity,
            issue.ruleName
        );
        this._fullDescription = issue.fullDescription;
        this._codeFlows = Translators.toAnalysisSteps(location.threadFlows);
    }

    public get codeFlows(): IAnalysisStep[][] {
        return this._codeFlows;
    }

    /**
     * Get the CVE details page of the issue
     */
    public getDetailsPage(): IEosPage {
        return {
            header: this.label,
            pageType: PageType.Eos,
            location: {
                file: this.parent.fullPath,
                row: this.regionWithIssue.start.line + 1,
                colum: this.regionWithIssue.start.character
            } as IAnalysisStep,
            description: this._fullDescription,
            analysisStep: this._codeFlows.length > 0 ? this._codeFlows[0] : undefined
        } as IEosPage;
    }
}
