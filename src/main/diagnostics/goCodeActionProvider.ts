import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { GoUtils } from '../utils/goUtils';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';

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

    /** @override */
    protected getSource(): string {
        if (this._treesManager.connectionManager.areCredentialsSet()) {
            return super.getSource();
        }
        return AbstractCodeActionProvider.GOCENTER_DIAGNOSTIC_SOURCE;
    }
}
