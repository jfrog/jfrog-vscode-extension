import { Set } from 'typescript-collections';
import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { IIssueKey } from '../types/issueKey';
import { ILicenseKey } from '../types/licenseKey';
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

    private licensesToMarkdown(licenses: Set<ILicenseKey>) {
        let markDownSyntax: string[] = [];
        licenses.forEach(licenseKey => {
            markDownSyntax.push(licenseKey.licenseName);
        });
        return markDownSyntax;
    }

    private getDetailsFromXray(node: DependenciesTreeNode): string {
        let xrayText: string = '### Details from Xray:\n\n';
        if (node.topSeverity !== Severity.Normal) {
            xrayText += '**Vulnerabilities**: ' + this.getIssueSummary(node.issues);
        }
        let violatedLicenses: Map<string, Set<string>> = node.getViolatedLicenses();
        if (violatedLicenses.size > 0) {
            xrayText += '\n\n**Transitive Violated Licenses**: ' + this.getViolatedLicenseInfo(violatedLicenses);
        }
        return xrayText + '\n\n' + this.createLicensesText(this.licensesToMarkdown(node.licenses));
    }

    private getViolatedLicenseInfo(violatedLicenses: Map<string, Set<string>>): string {
        let summary: string = '';
        for (let violatedLicense of violatedLicenses.keys()) {
            summary += violatedLicense + ', ';
        }
        return summary.substring(0, summary.length - 2) + '\n\n';
    }

    private createLicensesText(licenses: string[]) {
        return `${licenses ? `**Licenses**: ${licenses}\n\n` : '\n\n'}`;
    }

    private getIssueSummary(issues: Set<IIssueKey>): string {
        if (!issues) {
            return '';
        }
        let summary: string = '';
        let totalNumOfSeverities: Array<number> = new Array<number>(Object.keys(Severity).length / 2);
        issues.forEach(issueId => {
            let issue: IIssueCacheObject | undefined = this._treesManager.scanCacheManager.getIssue(issueId.issue_id);
            if (issue) {
                totalNumOfSeverities[issue.severity] = totalNumOfSeverities[issue.severity] ? totalNumOfSeverities[issue.severity] + 1 : 1;
            }
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
