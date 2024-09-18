import * as vscode from 'vscode';

import { FileRegion } from '../../../scanLogic/scanRunners/analyzerModels';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';
import { IAnalysisStep, ISecretsPage, PageType } from 'jfrog-ide-webview';
import { SeverityUtils } from '../../../types/severity';
import { SecurityIssue } from '../../utils/analyzerUtils';

/**
 * Describe a Secret issue
 */
export class SecretTreeNode extends CodeIssueTreeNode {
    private _fullDescription?: string;
    private _snippet?: string;
    private _tokenValidation?: string;
    private _metadata?: string;

    constructor(issue: SecurityIssue, location: FileRegion, parent: CodeFileTreeNode) {
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
        this._tokenValidation = location.properties?.tokenValidation;
        this._metadata = location.properties?.metadata;
        this._snippet = location.snippet?.text;
        this._fullDescription = issue.fullDescription;
    }

    public get snippet(): string | undefined {
        return this._snippet;
    }

    public get tokenValidation(): string | undefined {
        return this._tokenValidation;
    }

    public get metadata(): string | undefined {
        return this._metadata;
    }

    public get fullDescription(): string | undefined {
        return this._fullDescription;
    }

    public getDetailsPage(): ISecretsPage {
        return {
            pageType: PageType.Secrets,
            header: this.label,
            severity: SeverityUtils.toWebviewSeverity(this.severity),
            location: {
                file: this.parent.projectFilePath,
                snippet: this._snippet,
                startRow: this.regionWithIssue.start.line + 1,
                startColumn: this.regionWithIssue.start.character + 1,
                endRow: this.regionWithIssue.end.line + 1,
                endColumn: this.regionWithIssue.end.character + 1
            } as IAnalysisStep,
            description: this._fullDescription,
            tokenValidation: this._tokenValidation,
            metadata: this._metadata
        } as ISecretsPage;
    }
}
