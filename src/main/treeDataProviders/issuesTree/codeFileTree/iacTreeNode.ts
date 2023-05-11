import * as vscode from 'vscode';

import { FileRegion } from '../../../scanLogic/scanRunners/analyzerModels';
import { IacIssue } from '../../../scanLogic/scanRunners/iacScan';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';
import { IAnalysisStep, IIaCPage, PageType } from 'jfrog-ide-webview';
import { SeverityUtils } from '../../../types/severity';

/**
 * Describe a Infrastructure As Code (Iac) issue
 */
export class IacTreeNode extends CodeIssueTreeNode {
    private _fullDescription?: string;
    private _snippet?: string;

    constructor(issue: IacIssue, location: FileRegion, parent: CodeFileTreeNode) {
        super(
            issue.ruleId,
            parent,
            new vscode.Range(
                new vscode.Position(location.startLine, location.startColumn),
                new vscode.Position(location.endLine, location.endColumn)
            ),
            issue.severity,
            issue.ruleName
        );
        this._snippet = location.snippet?.text;
        this._fullDescription = issue.fullDescription;
    }

    public get snippet(): string | undefined {
        return this._snippet;
    }

    public get fullDescription(): string | undefined {
        return this._fullDescription;
    }

    public getDetailsPage(): IIaCPage {
        return {
            pageType: PageType.IaC,
            header: this.label,
            severity: SeverityUtils.toWebviewSeverity(this.severity),
            location: {
                file: this.parent.projectFilePath,
                snippet: this._snippet,
                row: this.regionWithIssue.start.line,
                column: this.regionWithIssue.start.character
            } as IAnalysisStep,
            description: this._fullDescription
        } as IIaCPage;
    }
}
