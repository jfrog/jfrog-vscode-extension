import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { FocusType } from '../focus/abstractFocus';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { GoUtils } from '../utils/goUtils';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';

export class GoCodeActionProvider extends AbstractCodeActionProvider implements ExtensionComponent {
    constructor(diagnosticCollection: vscode.DiagnosticCollection, treesManager: TreesManager) {
        super(GoUtils.DOCUMENT_SELECTOR, diagnosticCollection, treesManager);
    }

    /** @override */
    protected getDependenciesTree(): DependenciesTreeNode | undefined {
        return this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(GoUtils.PKG_TYPE);
    }

    /** @override */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        if (!vscode.languages.match(this._documentSelector, document)) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        let goDependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree();
        if (!goDependenciesTree) {
            return;
        }
        const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(document);
        goDependenciesTree.children.forEach(child => {
            this._treesManager.logManager.logMessage("<ASSAFA>adding old diag Go dependency '" + child.generalInfo.artifactId + "'", 'DEBUG');
            let dependencyPos: vscode.Position[] = GoUtils.getDependencyPos(document, child, FocusType.Dependency);
            if (dependencyPos.length === 0) {
                return;
            }
            this.addDiagnostic(diagnostics, child, dependencyPos);
            this.addGutter(textEditor, child.topSeverity, dependencyPos);
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }
}
