import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { GoUtils } from '../utils/goUtils';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';
import { Severity, SeverityUtils } from '../types/severity';
import { GoDependenciesTreeNode } from '../treeDataProviders/dependenciesTree/goDependenciesTreeNode';

export class GoCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(GoUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager);
    }

    /** @override */
    protected getDependenciesTree(document?: vscode.TextDocument): DependenciesTreeNode | undefined {
        return this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(GoUtils.PKG_TYPE);
    }

    /** @override */
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
            this.addDiagnostic(diagnostics, child, dependencyPos);
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }

    protected getSeverityMessage(node: DependenciesTreeNode): string {
        if (node instanceof GoDependenciesTreeNode || this._treesManager.connectionManager.areCredentialsSet()) {
            return node.topIssue.severity === Severity.Normal
                ? 'No security issues currently found from JFrog GoCenter'
                : `Top issue severity: ${SeverityUtils.getString(node.topIssue.severity)}`;
        }
        return super.getSeverityMessage(node);
    }

    protected getSource(): string {
        if (this._treesManager.connectionManager.areCredentialsSet()) {
            return super.getSource();
        }
        return 'JFrog GoCenter';
    }
}
