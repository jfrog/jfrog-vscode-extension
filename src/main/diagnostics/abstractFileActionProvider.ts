import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';

/**
 * @see DiagnosticsManager
 */
export abstract class AbstractFileActionProvider implements ExtensionComponent, vscode.Disposable {
    
    static readonly XRAY_DIAGNOSTIC_SOURCE: string = 'JFrog Xray';
    private _gutterDecorations: vscode.TextEditorDecorationType[] = [];

    constructor(
        protected _diagnosticCollection: vscode.DiagnosticCollection,
        protected _treesManager: TreesManager
    ) {}

    /**
     * Update diagnostics of the input project file.
     * @param document - Project file
     */
    public abstract updateDiagnostics(document: vscode.TextDocument): void;

    public activate(context: vscode.ExtensionContext) {
        this.registerListeners(context.subscriptions);
        vscode.workspace.textDocuments.forEach(this.updateDiagnostics, this);
    }

    private registerListeners(subscriptions: vscode.Disposable[]) {
        vscode.workspace.onDidOpenTextDocument(this.updateDiagnostics, this, subscriptions);
        subscriptions.push(vscode.workspace.onDidSaveTextDocument(this.updateDiagnostics, this));
        vscode.workspace.onDidCloseTextDocument(this.deleteDiagnostics, this, subscriptions);
    }

    /**
     * Add a new decoration to the gutter.
     * @param textEditor Gutter's editor.
     * @param iconPath Gutter's icon path.
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
     * @param diagnostics The diagnostics list
     * @param msg The diagnostic msg to add
     * @param position The position of the diagnostics in the file
     */
    createDiagnostics(diagnosticId: string, msg: string, position: vscode.Position[]): vscode.Diagnostic[] {
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

    protected getSource(): string {
        return AbstractFileActionProvider.XRAY_DIAGNOSTIC_SOURCE;
    }

    /**
     * Delete all the diagnostics for a specific file
     * @param document - the file we want to remove its diagnostics
     */
    deleteDiagnostics(document: vscode.TextDocument) {
        if (document.uri.scheme === 'file') {
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
}
