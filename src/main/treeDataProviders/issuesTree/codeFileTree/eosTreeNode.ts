import * as vscode from 'vscode';
import { IAnalysisStep, IEosPage, PageType } from 'jfrog-ide-webview';
import { EosIssue, EosIssueLocation } from '../../../scanLogic/scanRunners/eosScan';
import { SeverityUtils } from '../../../types/severity';
import { Translators } from '../../../utils/translators';
import { Utils } from '../../../utils/utils';
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

    public get fullDescription(): string | undefined {
        return this._fullDescription;
    }

    public get snippet(): string | undefined {
        return this._snippet;
    }

    public getDetailsPage(): IEosPage {
        return {
            header: this.label,
            pageType: PageType.Eos,
            severity: SeverityUtils.toWebviewSeverity(this.severity),
            ruleId: this.issueId,
            location: {
                fileName: Utils.getLastSegment(this.parent.projectFilePath),
                file: this.parent.projectFilePath,
                snippet: this.snippet,
                startRow: this.regionWithIssue.start.line + 1,
                startColumn: this.regionWithIssue.start.character + 1,
                endRow: this.regionWithIssue.end.line + 1,
                endColumn: this.regionWithIssue.end.character + 1
            } as IAnalysisStep,
            description: this._fullDescription,
            analysisStep: this._codeFlows.length > 0 ? this._codeFlows[0] : undefined
        } as IEosPage;
    }
}
