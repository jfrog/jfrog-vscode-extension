import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { PypiUtils } from '../utils/pypiUtils';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';

export class PypiCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(PypiUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager);
    }

    /** @override */
    protected getDependenciesTree(): DependenciesTreeNode | undefined {
        return this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(PypiUtils.PKG_TYPE);
    }

    /** @override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        if (!vscode.languages.match(this._documentSelector, document)) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        let pyPiDependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree();
        if (!pyPiDependenciesTree) {
            return;
        }
        let requirementsContent: string = document.getText().toLowerCase();
        const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);

        pyPiDependenciesTree.children.forEach(child => {
            let dependencyPos: vscode.Position[] = PypiUtils.getDependencyPos(document, requirementsContent, child);
            if (dependencyPos.length > 0) {
                this.addDiagnostic(diagnostics, child, dependencyPos);
                this.addGutter(textEditor, child.topSeverity, dependencyPos);
                return;
            }
            for (let grandChild of child.children) {
                dependencyPos = PypiUtils.getDependencyPos(document, requirementsContent, grandChild);
                if (dependencyPos.length > 0) {
                    this.addDiagnostic(diagnostics, grandChild, dependencyPos);
                    this.addGutter(textEditor, child.topSeverity, dependencyPos);
                }
            }
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }
}
