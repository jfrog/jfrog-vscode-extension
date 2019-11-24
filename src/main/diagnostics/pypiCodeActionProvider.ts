import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { PypiUtils } from '../utils/pypiUtils';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';

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
        let requirementsContent: string = document.getText().toLowerCase();
        pyPiDependenciesTree.children.forEach(child => {
            let dependencyPos: vscode.Position[] = PypiUtils.getDependencyPos(document, requirementsContent, child);
            if (dependencyPos.length > 0) {
                this.addDiagnostics(diagnostics, child, dependencyPos);
                return;
            }
            for (let grandChild of child.children) {
                dependencyPos = PypiUtils.getDependencyPos(document, requirementsContent, grandChild);
                if (dependencyPos.length > 0) {
                    this.addDiagnostics(diagnostics, grandChild, dependencyPos);
                }
            }
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }
}
