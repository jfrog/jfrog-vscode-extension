import * as vscode from 'vscode';
import * as Collections from 'typescript-collections';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { License } from '../types/license';

/**
 * @see HoverManager
 */
export abstract class AbstractHoverProvider implements vscode.HoverProvider, ExtensionComponent {
    constructor(protected _documentSelector: vscode.DocumentSelector, protected _treesManager: TreesManager) {}

    /**
     * Get the dependencies tree node that the user point above in the project descriptor.
     * @param document - The project descriptor
     * @param cursorPosition - The position of the mouse on the screen
     * @returns DependenciesTreeNode if the user is pointing on a dependency. Undefined otherwise.
     */
    public abstract getNodeByLocation(document: vscode.TextDocument, cursorPosition: vscode.Position): DependenciesTreeNode | undefined;

    public activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.languages.registerHoverProvider(this._documentSelector, this));
    }

    /**
     * Show licenses above the dependency when the user point the mouse above it.
     * @param document - The project descriptor
     * @param position - The position of the mouse on the screen
     */
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        let node: DependenciesTreeNode | undefined = this.getNodeByLocation(document, position);
        if (!node) {
            return;
        }
        let markdownString: vscode.MarkdownString = new vscode.MarkdownString(
            'Licenses: ' + this.licensesToMarkdown(node.licenses) + ' (JFrog Xray)'
        );
        return new vscode.Hover(markdownString);
    }

    protected licensesToMarkdown(licenses: Collections.Set<License>) {
        let markDownSyntax: string[] = [];
        licenses.forEach(license => {
            if (license.moreInfoUrl) {
                markDownSyntax.push('[' + license.name + '](' + license.moreInfoUrl[0] + ')');
            } else {
                markDownSyntax.push(license.name);
            }
        });
        return markDownSyntax;
    }
}
