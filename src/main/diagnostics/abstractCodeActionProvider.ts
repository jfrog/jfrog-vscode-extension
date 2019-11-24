import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { SeverityUtils, Severity } from '../types/severity';
import { DiagnosticsUtils } from './diagnosticsUtils';

/**
 * @see DiagnosticsManager
 */
export abstract class AbstractCodeActionProvider implements vscode.CodeActionProvider, ExtensionComponent {
    static readonly DIAGNOSTIC_SOURCE: string = 'JFrog Xray';

    constructor(
        protected _documentSelector: vscode.DocumentSelector,
        protected _diagnosticCollection: vscode.DiagnosticCollection,
        protected _treesManager: TreesManager
    ) {}

    /**
     * 1. Populate the 'Problems' view with top severities of the project dependencies.
     * 2. Provide red, yellow, green or white line under a dependency in the project descriptor.
     */

    public abstract updateDiagnostics(document: vscode.TextDocument): void;

    protected abstract getDependenciesTree(document?: vscode.TextDocument): DependenciesTreeNode | undefined;

    public activate(context: vscode.ExtensionContext) {
        this.registerListeners(context.subscriptions);
        vscode.workspace.textDocuments.forEach(this.updateDiagnostics, this);
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(this._documentSelector, this, {
                providedCodeActionKinds: [vscode.CodeActionKind.Empty]
            })
        );
    }

    private registerListeners(subscriptions: vscode.Disposable[]) {
        vscode.workspace.onDidOpenTextDocument(this.updateDiagnostics, this, subscriptions);
        subscriptions.push(vscode.workspace.onDidSaveTextDocument(this.updateDiagnostics, this));
        vscode.workspace.onDidCloseTextDocument(this.deleteDiagnostics, this, subscriptions);
    }

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.Command[] | undefined {
        let diagnostic: vscode.Diagnostic[] = context.diagnostics.filter(
            diagnostic => diagnostic.source === AbstractCodeActionProvider.DIAGNOSTIC_SOURCE
        );
        if (diagnostic.length === 0) {
            return undefined;
        }
        let dependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree(document);
        if (!dependenciesTree) {
            return undefined;
        }
        for (let child of dependenciesTree.children) {
            if (child.componentId === diagnostic[0].code) {
                return [this.createCommand(child)];
            }
            for (let grandchild of child.children) {
                if (grandchild.componentId === diagnostic[0].code) {
                    return [this.createCommand(grandchild)];
                }
            }
        }
        return undefined;
    }

    private createCommand(node: DependenciesTreeNode) {
        return {
            command: 'jfrog.xray.codeAction',
            title: 'Show in dependencies tree',
            arguments: [node]
        } as vscode.Command;
    }

    addDiagnostics(diagnostics: vscode.Diagnostic[], node: DependenciesTreeNode, dependencyPos: vscode.Position[]) {
        let diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
            new vscode.Range(dependencyPos[0], dependencyPos[1]),
            node.topIssue.severity === Severity.Normal
                ? 'No issues found.'
                : 'Top issue severity: ' + SeverityUtils.getString(node.topIssue.severity),
            DiagnosticsUtils.getDiagnosticSeverity(node.topIssue.severity)
        );
        diagnostic.source = 'JFrog Xray';
        diagnostic.code = node.componentId;
        diagnostics.push(diagnostic);
    }

    deleteDiagnostics(document: vscode.TextDocument) {
        if (document.uri.scheme === 'file') {
            this._diagnosticCollection.delete(document.uri);
        }
    }

    dispose() {
        this._diagnosticCollection.clear();
        this._diagnosticCollection.dispose();
    }
}
