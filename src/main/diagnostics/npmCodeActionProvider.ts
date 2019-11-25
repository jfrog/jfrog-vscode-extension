import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { NpmUtils } from '../utils/npmUtils';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';

export class NpmCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(NpmUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager);
    }

    /** @override */
    protected getDependenciesTree(document?: vscode.TextDocument): DependenciesTreeNode | undefined {
        return this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(
            NpmUtils.PKG_TYPE,
            document ? path.dirname(document.uri.fsPath) : document
        );
    }

    /** @override */
    public updateDiagnostics(document: vscode.TextDocument): void {
        if (!vscode.languages.match(this._documentSelector, document)) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        let npmDependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree(document);
        if (!npmDependenciesTree) {
            return;
        }
        npmDependenciesTree.children.forEach(child => {
            let dependencyPos: vscode.Position[] = NpmUtils.getDependencyPos(document, child);
            if (dependencyPos.length === 0) {
                return;
            }
            this.addDiagnostic(diagnostics, child, dependencyPos);
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }
}
