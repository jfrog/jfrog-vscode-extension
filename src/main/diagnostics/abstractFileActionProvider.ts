import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';

/**
 * @see DiagnosticsManager
 */
export abstract class AbstractFileActionProvider implements ExtensionComponent, vscode.Disposable {
    static readonly JFROG_DIAGNOSTIC_SOURCE: string = 'JFrog';
    private _gutterDecorations: vscode.TextEditorDecorationType[] = [];

    constructor(protected _diagnosticCollection: vscode.DiagnosticCollection, protected _treesManager: TreesManager) {}

    /**
     * Update diagnostics of the input project file.
     * @param document - Project file
     */
    public abstract updateDiagnostics(document: vscode.TextDocument): void;

    public activate(context: vscode.ExtensionContext) {
        this.registerListeners(context.subscriptions);
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
     * @param locations Gutter's positions in the editor.
     */
    addGutter(textEditor: vscode.TextEditor, iconPath: string, ...locations: vscode.Range[]) {
        if (textEditor) {
            const decoration: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
                gutterIconPath: iconPath
            });
            textEditor.setDecorations(decoration, locations);
            this._gutterDecorations.push(decoration);
        }
    }

    /**
     * Add a new diagnostic to the input diagnostics list.
     * @param diagnostics The diagnostics list
     * @param msg The diagnostic msg to add
     * @param position The position of the diagnostics in the file
     */
    createDiagnostics(
        diagnosticId: string,
        msg: string,
        diagnosticSeverity: vscode.DiagnosticSeverity,
        ...locations: vscode.Range[]
    ): vscode.Diagnostic[] {
        return locations.map(location => this.createDiagnostic(diagnosticId, msg, diagnosticSeverity, location));
    }

    createDiagnostic(diagnosticId: string, msg: string, diagnosticSeverity: vscode.DiagnosticSeverity, location: vscode.Range): vscode.Diagnostic {
        let diagnostic: vscode.Diagnostic = new vscode.Diagnostic(location, msg, diagnosticSeverity);
        diagnostic.source = this.getSource();
        diagnostic.code = diagnosticId;
        return diagnostic;
    }

    protected getSource(): string {
        return AbstractFileActionProvider.JFROG_DIAGNOSTIC_SOURCE;
    }

    protected isJFrogSource(src?: string): boolean {
        return src == AbstractFileActionProvider.JFROG_DIAGNOSTIC_SOURCE;
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

    clearDiagnostics() {
        this._diagnosticCollection.clear();
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
