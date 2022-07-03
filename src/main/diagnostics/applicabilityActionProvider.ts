import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { SourceCodeCveTreeNode } from '../treeDataProviders/sourceCodeTree/sourceCodeCveNode';
import { SourceCodeFileTreeNode } from '../treeDataProviders/sourceCodeTree/sourceCodeFileTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { Severity } from '../types/severity';
import { DiagnosticsUtils } from './diagnosticsUtils';

/**
 * @see DiagnosticsManager
 */
export class ApplicabilityCodeActionProvider implements vscode.CodeActionProvider, ExtensionComponent, vscode.Disposable {
    static readonly APPLICABILITY_DIAGNOSTIC_SOURCE: string = 'JFrog Applicability Diagnostic';
    constructor(protected _diagnosticCollection: vscode.DiagnosticCollection, protected _treesManager: TreesManager) {}

    activate(context: vscode.ExtensionContext) {
        this.registerListeners(context.subscriptions);
        vscode.workspace.textDocuments.forEach(this.updateDiagnostics, this);
        context.subscriptions.push(
            this,
            vscode.languages.registerCodeActionsProvider({ scheme: 'file', pattern: '**/*.{py,js}' }, this, {
                providedCodeActionKinds: [vscode.CodeActionKind.Empty]
            })
        );
    }

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        let diagnostic: vscode.Diagnostic[] = context.diagnostics.filter(diagnostic => this.isJFrogSource(diagnostic.source));
        if (diagnostic.length === 0) {
            return undefined;
        }
        let dependenciesTree: SourceCodeFileTreeNode | undefined = this._treesManager.sourceCodeTreeDataProvider.getFileTreeNode(document.fileName);
        if (dependenciesTree === undefined) {
            return undefined;
        }
        for (let child of dependenciesTree.children) {
            if (child.cve === diagnostic[0].code) {
                return [this.createCommand(child)];
            }
        }
        return undefined;
    }
    
    /**
     * Add an eye icon to the CVE node. Clicking on it opens the file at which the CVE applies.
     */
    private createCommand(node: SourceCodeCveTreeNode): vscode.Command {
        return {
            command: 'jfrog.source.code.scan.showInSourceCodeTree',
            title: 'Show in CVE Applicability view',
            arguments: [node]
        } as vscode.Command;
    }

    /**
     * Updates a diagnostics in a document based on CVEs  found in it.
     */
    public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const scanResult: SourceCodeFileTreeNode | undefined = this._treesManager.sourceCodeTreeDataProvider.getFileTreeNode(document.fileName);
        if (scanResult === undefined) {
            return;
        }
        let diagnostics: vscode.Diagnostic[] = [];
        scanResult.children.forEach(node => {
            for (const nodeDetails of node.getNodeDetails()) {
                const startPos: vscode.Position = new vscode.Position(nodeDetails.startLine - 1, nodeDetails.startColumn);
                const endPosition: vscode.Position = new vscode.Position(nodeDetails.endLine - 1, nodeDetails.endColumn);
                let diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
                    new vscode.Range(startPos, endPosition),
                    nodeDetails.codeIssue,
                    DiagnosticsUtils.toDiagnosticSeverity(node.severity ?? Severity.Critical)
                );
                diagnostic.source = this.getSource();
                diagnostic.code = node.cve;
                diagnostics.push(diagnostic);
            }
        });
        this._diagnosticCollection.set(document.uri, diagnostics);
    }

    private registerListeners(subscriptions: vscode.Disposable[]) {
        vscode.workspace.onDidOpenTextDocument(this.updateDiagnostics, this, subscriptions);
        subscriptions.push(vscode.workspace.onDidSaveTextDocument(this.updateDiagnostics, this));
        vscode.workspace.onDidCloseTextDocument(doc => this._diagnosticCollection.delete(doc.uri));
    }

    dispose() {
        this._diagnosticCollection.clear();
        this._diagnosticCollection.dispose();
    }

    protected getSource(): string {
        return ApplicabilityCodeActionProvider.APPLICABILITY_DIAGNOSTIC_SOURCE;
    }

    private isJFrogSource(source: string | undefined) {
        return source === ApplicabilityCodeActionProvider.APPLICABILITY_DIAGNOSTIC_SOURCE;
    }
}
