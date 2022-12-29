import * as vscode from 'vscode';
import { CodeFileTreeNode } from '../treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssueTreeNode } from '../treeDataProviders/issuesTree/issueTreeNode';
import { SeverityUtils } from '../types/severity';

import { AbstractFileActionProvider } from './abstractFileActionProvider';

export class ApplicablityActionProvider extends AbstractFileActionProvider implements vscode.CodeActionProvider {
    /** @Override */
    public activate(context: vscode.ExtensionContext) {
        super.activate(context);
        context.subscriptions.push(
            this,
            vscode.languages.registerCodeActionsProvider({ scheme: 'file', pattern: '**/*.{py,js}' }, this, {
                providedCodeActionKinds: [vscode.CodeActionKind.Empty]
            })
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
                diagnostic => this.isJFrogSource(diagnostic.source) && diagnostic.range.contains(range)
            );
            if (diagnostics.length == 0) {
                return undefined;
            }
            this._treesManager.logManager.logMessage("Creating code action for CodeFileTreeNode '" + document.uri.fsPath + "'", 'DEBUG');
            let commands: vscode.Command[] = [];
            for (let diagnostic of diagnostics) {
                let issue: CodeIssueTreeNode | undefined = <CodeIssueTreeNode | undefined>(
                    fileNode.issues.find(i => i instanceof CodeIssueTreeNode && i.issueId == diagnostic.code && i?.regionWithIssue.contains(range))
                );
                if (issue) {
                    commands.push({
                        command: 'jfrog.issues.select.node',
                        title: 'Show in issues tree',
                        arguments: [issue]
                    });
                }
            }
            return commands.length > 0 ? commands : undefined;
        }

        return undefined;
    }

    /** @Override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        // Search if the file had issues in the scan
        const fileIssues: FileTreeNode | undefined = this._treesManager.issuesTreeDataProvider.getFileIssuesTree(document.uri.fsPath);
        if (fileIssues instanceof CodeFileTreeNode) {
            this._treesManager.logManager.logMessage("Creating diagnostics for CodeFileTreeNode '" + document.uri.fsPath + "'", 'DEBUG');
            let diagnostics: vscode.Diagnostic[] = [];
            fileIssues.issues.forEach(issue => this.generateInformation(issue, diagnostics));
            this._diagnosticCollection.set(document.uri, diagnostics);
        }
    }

    /**
     * Genereate diagnostics information for an applicable issue
     * @param issue - the applicable issue to generate diagnostics for
     * @param diagnostics - list of all the diagnostics of the file
     */
    generateInformation(issue: IssueTreeNode, diagnostics: vscode.Diagnostic[]): void {
        if (issue instanceof CodeIssueTreeNode) {
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
