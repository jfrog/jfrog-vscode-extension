import * as vscode from 'vscode';
import { CodeFileTreeNode } from '../treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssueTreeNode } from '../treeDataProviders/issuesTree/issueTreeNode';
import { Severity, SeverityUtils } from '../types/severity';

import { AbstractFileActionProvider } from './abstractFileActionProvider';

export class CodeFileActionProvider extends AbstractFileActionProvider implements vscode.CodeActionProvider {
    /** @Override */
    public activate(context: vscode.ExtensionContext) {
        super.activate(context);
        context.subscriptions.push(
            this,
            vscode.languages.registerCodeActionsProvider({ scheme: 'file', pattern: '**/*.{py,js}' }, this, {
                providedCodeActionKinds: [vscode.CodeActionKind.Empty]
            } as vscode.CodeActionProviderMetadata)
        );
    }

    /** @Override */
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.Command[] | undefined {
        // Search if the file had issues in the scan
        const fileNode: FileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getFileIssuesTree(document.uri.fsPath);
        if (fileNode instanceof CodeFileTreeNode) {
            let diagnostics: vscode.Diagnostic[] = context.diagnostics.filter(
                // Get the diagnostics we created in the specific range in the document
                diagnostic => this.isJFrogSource(diagnostic.source) && diagnostic.range.contains(range)
            );
            if (diagnostics.length == 0) {
                return undefined;
            }
            this._treesManager.logManager.logMessage("Creating code action for CodeFileTreeNode '" + document.uri.fsPath + "'", 'DEBUG');
            let commands: vscode.Command[] = [];
            for (let diagnostic of diagnostics) {
                let issue: CodeIssueTreeNode | undefined = <CodeIssueTreeNode | undefined>(
                    fileNode.issues.find(issue => this.isCodeIssueInRange(issue, diagnostic, range))
                );
                if (issue) {
                    commands.push({
                        command: 'jfrog.issues.select.node',
                        title: 'Show ' + issue.label + ' issue in issues tree',
                        arguments: [issue]
                    });
                }
            }
            return commands;
        }

        return undefined;
    }

    /**
     * Check if the given issue is CodeIssueTreeNode and the given diagnostic and range is related to it.
     * @param issue - the issue to check
     * @param diagnostic - the diagnostic to check
     * @param range - the range to check
     * @returns - true if the issue is CodeIssueTreeNode and in the given range and the given diagnostic related to it.
     */
    private isCodeIssueInRange(issue: IssueTreeNode, diagnostic: vscode.Diagnostic, range: vscode.Range | vscode.Selection): boolean {
        if (issue instanceof CodeIssueTreeNode) {
            return issue.issueId == diagnostic.code && issue.regionWithIssue.contains(range);
        }
        return false;
    }

    /** @Override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const tree: CodeFileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getCodeIssueTree(document.uri.fsPath);
        if (!tree) {
            return;
        }
        this._treesManager.logManager.logMessage("Creating applicable diagnostics for issue '" + tree.fullPath + "'", 'DEBUG');
        this.addUnderlineToIssues(document, tree.issues);
        this.addGutterToIssues(document, tree.issues);
    }

    private addUnderlineToIssues(document: vscode.TextDocument, issues: CodeIssueTreeNode[]) {
        this._diagnosticCollection.set(
            document.uri,
            issues.map(issue => this.createDiagnosticIssue(issue))
        );
    }

    createDiagnosticIssue(issue: CodeIssueTreeNode): vscode.Diagnostic {
        return this.createDiagnostic(
            issue.issueId,
            `🐸 ${issue.label} - Severity: ${SeverityUtils.getString(issue.severity)}`,
            vscode.DiagnosticSeverity.Warning,
            issue.regionWithIssue
        );
    }

    private async addGutterToIssues(document: vscode.TextDocument, issues: CodeIssueTreeNode[]) {
        let topSeverities: Map<vscode.Range, Severity> = this.filterByTopSeverity(issues);
        const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        for (const [region, severity] of topSeverities) {
            this.addGutter(textEditor, SeverityUtils.getIcon(severity), region);
        }
    }

    private filterByTopSeverity(issues: CodeIssueTreeNode[]): Map<vscode.Range, Severity> {
        let gutterSeverity: Map<vscode.Range, Severity> = new Map<vscode.Range, Severity>();
        issues.forEach(issue => {
            let topSeverity: Severity | undefined = gutterSeverity.get(issue.regionWithIssue);
            if (!topSeverity || topSeverity < issue.severity) {
                gutterSeverity.set(issue.regionWithIssue, issue.severity);
            }
        });
        return gutterSeverity;
    }
}
