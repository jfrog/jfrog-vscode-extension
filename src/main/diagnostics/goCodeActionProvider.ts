import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { Severity, SeverityUtils } from '../types/severity';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';
import { DiagnosticsUtils } from './diagnosticsUtils';
import { GoUtils } from '../utils/goUtils';

export class GoCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(GoUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager, 'go');
    }

    public updateDiagnostics(document: vscode.TextDocument): void {
        if (!vscode.languages.match(this._documentSelector, document)) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        let goDependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree(document);
        if (!goDependenciesTree) {
            return;
        }
        goDependenciesTree.children.forEach(child => {
            let dependencyPos: vscode.Position[] = GoUtils.getDependencyPos(document, child);
            if (dependencyPos.length === 0) {
                return;
            }
            let diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
                new vscode.Range(dependencyPos[0], dependencyPos[1]),
                child.topIssue.severity === Severity.Normal
                    ? 'No issues found.'
                    : 'Top issue severity: ' + SeverityUtils.getString(child.topIssue.severity),
                DiagnosticsUtils.getDiagnosticSeverity(child.topIssue.severity)
            );
            diagnostic.source = 'JFrog Xray';
            diagnostic.code = child.componentId;
            diagnostics.push(diagnostic);
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }
}
