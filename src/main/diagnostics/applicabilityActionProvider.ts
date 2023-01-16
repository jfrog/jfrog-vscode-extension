import * as vscode from 'vscode';
import { CodeFileTreeNode } from '../treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssueTreeNode } from '../treeDataProviders/issuesTree/issueTreeNode';
import { Severity, SeverityUtils } from '../types/severity';

import { AbstractFileActionProvider } from './abstractFileActionProvider';

export class ApplicabilityActionProvider extends AbstractFileActionProvider implements vscode.CodeActionProvider {
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
                        title: 'Show in issues tree',
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
        // Search if the file had issues in the scan
        const fileIssues: FileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getFileIssuesTree(document.uri.fsPath);
        if (fileIssues instanceof CodeFileTreeNode) {
            this._treesManager.logManager.logMessage("Creating diagnostics for CodeFileTreeNode '" + document.uri.fsPath + "'", 'DEBUG');
            let diagnostics: vscode.Diagnostic[] = [];
            let topSeverityMap: Map<vscode.Range, Severity> = new Map<vscode.Range, Severity>();
            fileIssues.issues.forEach(issue => this.generateInformation(issue, diagnostics, topSeverityMap));
            const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
            for (const [region, severity] of topSeverityMap) {
                // Add gutter icons of top severity for the region with the issue
                this.addGutter(textEditor, SeverityUtils.getIcon(severity), [region.start, region.end]);
            }
            this._diagnosticCollection.set(document.uri, diagnostics);
        }
    }

    /**
     * Generate diagnostics information for an applicable issue
     * @param issue - the applicable issue to generate diagnostics for
     * @param diagnostics - list of all the diagnostics of the file
     * @param topSeverityMap - a map from regions in the file to their top severity
     */
    generateInformation(issue: IssueTreeNode, diagnostics: vscode.Diagnostic[], topSeverityMap: Map<vscode.Range, Severity>): void {
        if (issue instanceof CodeIssueTreeNode) {
            // Calculate top severity for region
            let rangeSeverity: Severity | undefined = topSeverityMap.get(issue.regionWithIssue);
            if (!rangeSeverity || rangeSeverity < issue.severity) {
                topSeverityMap.set(issue.regionWithIssue, issue.severity);
            }
            // Add diagnostics
            let position: vscode.Position[] = [issue.regionWithIssue.start, issue.regionWithIssue.end];
            this._treesManager.logManager.logMessage("Creating applicable diagnostics for issue '" + issue.issueId + "'", 'DEBUG');
            // Create diagnostics and gutter icon for the dependency
            let created: vscode.Diagnostic[] = this.createDiagnostics(
                issue.issueId,
                'Severity: ' + SeverityUtils.getString(issue.severity),
                position
            );
            diagnostics.push(...created);
        }
    }
}
