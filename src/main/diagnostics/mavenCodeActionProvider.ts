import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/mavenTree';
import { MavenUtils } from '../utils/mavenUtils';
import { FocusType } from '../focus/abstractFocus';

export class MavenCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(MavenUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager);
    }

    /** @override */
    protected getDependenciesTree(document?: vscode.TextDocument): DependenciesTreeNode | undefined {
        return this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(
            MavenUtils.PKG_TYPE,
            document ? path.dirname(document.uri.fsPath) : document
        );
    }

    /** @override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        if (!vscode.languages.match(this._documentSelector, document)) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        let mavenDependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree(document);
        if (!mavenDependenciesTree) {
            return;
        }
        const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);
        mavenDependenciesTree.children.forEach(child => {
            if (child instanceof MavenTreeNode) {
                return;
            }
            let dependencyPos: vscode.Position[] = MavenUtils.getDependencyPos(document, child, FocusType.Dependency);
            if (dependencyPos.length === 0) {
                return;
            }
            this.addDiagnostic(diagnostics, child, dependencyPos);
            this.addGutter(textEditor, child.topSeverity, dependencyPos);
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }
}
