import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
// import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
// import { IssuesRootTreeNode } from '../treeDataProviders/issuesTree/issuesRootTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';

/**
 * @see DiagnosticsManager
 */
export abstract class AbstractFileActionProvider implements ExtensionComponent, vscode.Disposable {
    //, vscode.CodeActionProvider {
    static readonly XRAY_DIAGNOSTIC_SOURCE: string = 'JFrog Xray';
    private _gutterDecorations: vscode.TextEditorDecorationType[] = [];

    constructor(
        // protected _documentSelector: vscode.DocumentSelector,
        protected _diagnosticCollection: vscode.DiagnosticCollection,
        protected _treesManager: TreesManager
    ) {}

    /**
     * Update diagnostics of the input project descriptor file:
     * 1. Populate the 'Problems' view with top severities of the project dependencies.
     * 2. Provide red, yellow, green or white line under a dependency in the project descriptor.
     * @param document - Project descriptor file
     */
    public abstract updateDiagnostics(document: vscode.TextDocument): void;

    // /**
    //  * Get the dependencies tree node according to the package type.
    //  * @param document - Project descriptor file
    //  */
    // protected abstract getImpactTree(document?: vscode.TextDocument): IssuesRootTreeNode | undefined;

    public activate(context: vscode.ExtensionContext) {
        this._treesManager.logManager.logMessage("<ASSAFA> Activating '" + AbstractFileActionProvider.name + "'",'DEBUG');
        this.registerListeners(context.subscriptions);
        vscode.workspace.textDocuments.forEach(this.updateDiagnostics, this);
        // vscode.workspace.textDocuments.forEach(this.updateDiagnostics, this);
        // context.subscriptions.push(
        //     this,
        //     vscode.languages.registerCodeActionsProvider(this._documentSelector, this, {
        //         providedCodeActionKinds: [vscode.CodeActionKind.Empty]
        //     })
        // );
    }

    private registerListeners(subscriptions: vscode.Disposable[]) {
        // Gutters
        vscode.workspace.onDidOpenTextDocument(this.updateDiagnostics, this, subscriptions);
        subscriptions.push(vscode.workspace.onDidSaveTextDocument(this.updateDiagnostics, this));
        //
        // vscode.workspace.onDidOpenTextDocument(this.updateDiagnostics, this, subscriptions);
        // subscriptions.push(vscode.workspace.onDidSaveTextDocument(this.updateDiagnostics, this));
        // vscode.workspace.onDidCloseTextDocument(this.deleteDiagnostics, this, subscriptions);

        vscode.workspace.onDidCloseTextDocument(this.deleteDiagnostics, this, subscriptions);
    }

    /**
     * Add a new severity icon on the gutter.
     * @param textEditor Gutter's editor.
     * @param severity Gutter's icon path.
     * @param position Gutter's position in the editor.
     */
    addGutter(textEditor: vscode.TextEditor, iconPath: string, position: vscode.Position[]) {
        if (textEditor) {
            for (let i: number = 0; i < position.length; i += 2) {
                const decoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
                    gutterIconPath: iconPath //SeverityUtils.getIcon(severity)
                });
                textEditor.setDecorations(decoration, [new vscode.Range(position[i], position[i + 1])]);
                this._gutterDecorations.push(decoration);
            }
        }
    }

    /**
     * Add a new diagnostic to the input diagnostics list.
     * Fill up the new diagnostic with information from the input dependencies tree node and the input position in the project descriptor.
     * @param diagnostics The diagnostics list
     * @param node The dependencies tree node
     * @param dependencyPos The position of the diagnostics in the descriptor
     */
    createDiagnostics(diagnosticId: string, msg: string, position: vscode.Position[]) : vscode.Diagnostic[] {
        let diagnostics: vscode.Diagnostic[] = [];
        for (let i: number = 0; i < position.length; i += 2) {
            let diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
                new vscode.Range(position[i], position[i + 1]),
                msg,
                vscode.DiagnosticSeverity.Hint
            );
            diagnostic.source = this.getSource();
            diagnostic.code = diagnosticId;
            diagnostics.push(diagnostic);
        }
        return diagnostics;
    }

    deleteDiagnostics(document: vscode.TextDocument) {
        if (document.uri.scheme === 'file') {
            this._treesManager.logManager.logMessage("<ASSAFA> delete diagnostics for '" + document.uri.fsPath + "'", 'DEBUG');
            this._diagnosticCollection.delete(document.uri);
        }
    }

    /** @override */
    dispose() {
        this._diagnosticCollection.clear();
        this._diagnosticCollection.dispose();
        this.disposeGutterDecorations();
    }

    private disposeGutterDecorations() {
        this._gutterDecorations.forEach(decoration => {
            decoration.dispose();
        });
        this._gutterDecorations = [];
    }

    protected getSource(): string {
        return AbstractFileActionProvider.XRAY_DIAGNOSTIC_SOURCE;
    }

    // private isJFrogSource(source: string | undefined) {
    //     return source === AbstractFileActionProvider.XRAY_DIAGNOSTIC_SOURCE;
    // }
}
