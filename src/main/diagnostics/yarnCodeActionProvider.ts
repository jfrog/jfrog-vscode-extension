import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { YarnUtils } from '../utils/yarnUtils';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';

export class YarnCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(YarnUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager);
    }

    /** @override */
    protected getDependenciesTree(document?: vscode.TextDocument): DependenciesTreeNode | undefined {
        return this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(
            YarnUtils.PKG_TYPE,
            document ? path.dirname(document.uri.fsPath) : document
        );
    }

    /** @override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        if (!vscode.languages.match(this._documentSelector, document)) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);
        let yarnDependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree(document);
        if (!yarnDependenciesTree) {
            return;
        }
        yarnDependenciesTree.children.forEach(child => {
            let dependencyPos: vscode.Position[] = YarnUtils.getDependencyPos(document, child);
            if (dependencyPos.length === 0) {
                return;
            }
            this.addDiagnostic(diagnostics, child, dependencyPos);
            this.addGutter(textEditor, child.topSeverity, dependencyPos);
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }
}
