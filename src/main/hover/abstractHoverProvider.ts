import * as vscode from 'vscode';
import * as Collections from 'typescript-collections';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { License } from '../types/license';
import { Issue } from '../types/issue';
import { Severity, SeverityUtils } from '../types/severity';

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
    public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        let node: DependenciesTreeNode | undefined = this.getNodeByLocation(document, position);
        if (!node) {
            return;
        }
        return new vscode.Hover(new vscode.MarkdownString(this.getDetailsFromXray(node)));
    }

    protected licensesToMarkdown(licenses: Collections.Set<License>) {
        let markDownSyntax: string[] = [];
        licenses.forEach(license => {
            markDownSyntax.push(license.name);
        });
        return markDownSyntax;
    }

    protected getDetailsFromXray(node: DependenciesTreeNode): string {
        let xrayText: string = '### Details from Xray:\n\n';
        if (node.topIssue.severity !== Severity.Normal) {
            xrayText += '**Vulnerabilities**: ' + this.getIssueSummary(node.issues);
        }
        return xrayText + '\n\n' + this.createLicensesText(this.licensesToMarkdown(node.licenses));
    }

    protected createLicensesText(licenses: string[]) {
        return `${licenses ? `**Licenses**: ${licenses}\n\n` : '\n\n'}`;
    }

    protected getIssueSummary(issues: Collections.Set<Issue>): string {
        if (!issues) {
            return '';
        }
        let summary: string = '';
        let totalNumOfSeverities: Array<number> = new Array<number>(Object.keys(Severity).length / 2);
        issues.forEach(issue => {
            totalNumOfSeverities[issue.severity] = totalNumOfSeverities[issue.severity] ? totalNumOfSeverities[issue.severity] + 1 : 1;
        });
        // Print severities from high to low.
        for (let i: number = totalNumOfSeverities.length - 1; i >= 0; i--) {
            if (!totalNumOfSeverities[i]) {
                continue;
            }
            summary += `![severity.icon](${SeverityUtils.getIcon(i, true)}) ${SeverityUtils.getString(i)} (${totalNumOfSeverities[i]})  &nbsp;`;
        }
        return summary;
    }
}
