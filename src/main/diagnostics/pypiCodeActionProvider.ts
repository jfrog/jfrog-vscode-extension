import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { Severity, SeverityUtils } from '../types/severity';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';
import { DiagnosticsUtils } from './diagnosticsUtils';
import { PypiUtils } from '../utils/pypiUtils';

export class PypiCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(PypiUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager, 'pypi');
    }

    protected getDependenciesTree(document?: vscode.TextDocument): DependenciesTreeNode | undefined {
        return this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(this._pkgType);
    }

    public updateDiagnostics(document: vscode.TextDocument): void {
        if (!vscode.languages.match(this._documentSelector, document)) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        let pyPiDependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree();
        if (!pyPiDependenciesTree) {
            return;
        }
        pyPiDependenciesTree.children.forEach(child => {
            let dependencyPos: vscode.Position[] = PypiUtils.getDependencyPos(document, child);
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
