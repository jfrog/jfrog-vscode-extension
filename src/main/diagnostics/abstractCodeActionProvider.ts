import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { Severity, SeverityUtils } from '../types/severity';
import { DiagnosticsUtils } from './diagnosticsUtils';
import { GoDependenciesTreeNode } from '../treeDataProviders/dependenciesTree/goDependenciesTreeNode';

/**
 * @see DiagnosticsManager
 */
export abstract class AbstractCodeActionProvider implements vscode.CodeActionProvider, ExtensionComponent {
    static readonly XRAY_DIAGNOSTIC_SOURCE: string = 'JFrog Xray';
    static readonly GOCENTER_DIAGNOSTIC_SOURCE: string = 'JFrog GoCenter';

    constructor(
        protected _documentSelector: vscode.DocumentSelector,
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

    /**
     * Get the dependencies tree node according to the package type.
     * @param document - Project descriptor file
     */
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
        let diagnostic: vscode.Diagnostic[] = context.diagnostics.filter(diagnostic => this.isJFrogSource(diagnostic.source));
        if (diagnostic.length === 0) {
            return undefined;
        }
        let dependenciesTree: DependenciesTreeNode | undefined = this.getDependenciesTree(document);
        if (!dependenciesTree) {
            return undefined;
        }
        for (let child of dependenciesTree.children) {
            if (child.componentId === diagnostic[0].code) {
                if (child instanceof GoDependenciesTreeNode) {
                    return [this.createCommand(child), ...this.createGoCenterCommand(child)];
                }
                return [this.createCommand(child)];
            }
            for (let grandchild of child.children) {
                if (grandchild.componentId === diagnostic[0].code) {
                    if (grandchild instanceof GoDependenciesTreeNode) {
                        return [this.createCommand(grandchild), ...this.createGoCenterCommand(grandchild)];
                    }
                    return [this.createCommand(grandchild)];
                }
            }
        }
        return undefined;
    }

    private createCommand(node: DependenciesTreeNode): vscode.Command {
        return {
            command: 'jfrog.xray.codeAction',
            title: 'Show in dependencies tree',
            arguments: [node]
        } as vscode.Command;
    }

    private createGoCenterCommand(node: GoDependenciesTreeNode): vscode.Command[] {
        const linksCommand: vscode.Command[] = [];
        if (node.componentMetadata?.vulnerabilities?.gocenter_security_url) {
            linksCommand.push({
                command: 'jfrog.xray.openLink',
                title: 'View CVE in GoCenter',
                arguments: [node.componentMetadata.vulnerabilities.gocenter_security_url]
            } as vscode.Command);
        }
        if (node.componentMetadata?.gocenter_metrics_url) {
            linksCommand.push({
                command: 'jfrog.xray.openLink',
                title: 'View Metrics in GoCenter',
                arguments: [node.componentMetadata.gocenter_metrics_url]
            } as vscode.Command);
        }
        if (node.componentMetadata?.gocenter_readme_url) {
            linksCommand.push({
                command: 'jfrog.xray.openLink',
                title: 'View ReadMe in GoCenter',
                arguments: [node.componentMetadata.gocenter_readme_url]
            } as vscode.Command);
        }
        return linksCommand;
    }

    /**
     * Add a new diagnostic to the input diagnostics list.
     * Fill up the new diagnostic with information from the input dependencies tree node and the input position in the project descriptor.
     * @param diagnostics The diagnostics list
     * @param node The dependencies tree node
     * @param dependencyPos The position of the diagnostics in the descriptor
     */
    addDiagnostic(diagnostics: vscode.Diagnostic[], node: DependenciesTreeNode, dependencyPos: vscode.Position[]) {
        for (let i: number = 0; i < dependencyPos.length; i += 2) {
            let diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
                new vscode.Range(dependencyPos[i], dependencyPos[i + 1]),
                node.topIssue.severity === Severity.Normal
                    ? 'No issues found.'
                    : 'Top issue severity: ' + SeverityUtils.getString(node.topIssue.severity),
                DiagnosticsUtils.getDiagnosticSeverity(node.topIssue.severity)
            );
            diagnostic.source = this.getSource();
            diagnostic.code = node.componentId;
            diagnostics.push(diagnostic);
        }
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

    protected getSource(): string {
        return AbstractCodeActionProvider.XRAY_DIAGNOSTIC_SOURCE;
    }

    private isJFrogSource(source: string | undefined) {
        return source === AbstractCodeActionProvider.XRAY_DIAGNOSTIC_SOURCE || source === AbstractCodeActionProvider.GOCENTER_DIAGNOSTIC_SOURCE;
    }
}
