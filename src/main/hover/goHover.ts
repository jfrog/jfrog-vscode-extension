import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractHoverProvider } from './abstractHoverProvider';
import { GoUtils } from '../utils/goUtils';
import { GoDependenciesTreeNode } from '../treeDataProviders/dependenciesTree/goDependenciesTreeNode';
import { Severity, SeverityUtils } from '../types/severity';
import { ISeverityCount } from '../goCenterClient/model/SeverityCount';

export class GoHover extends AbstractHoverProvider {
    constructor(treesManager: TreesManager) {
        super(GoUtils.DOCUMENT_SELECTOR, treesManager);
    }

    /** @override */
    public getNodeByLocation(document: vscode.TextDocument, cursorPosition: vscode.Position): DependenciesTreeNode | undefined {
        let dependenciesTree: DependenciesTreeNode | undefined = this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(
            'go',
            path.dirname(document.uri.fsPath)
        );
        if (!dependenciesTree) {
            return;
        }
        for (const child of dependenciesTree.children) {
            let pos: vscode.Position[] = GoUtils.getDependencyPos(document, child);
            let range: vscode.Range = new vscode.Range(pos[0], pos[1]);
            if (range.contains(cursorPosition)) {
                return child;
            }
        }
        return undefined;
    }

    /** @override */
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        let node: DependenciesTreeNode | undefined = this.getNodeByLocation(document, position);
        if (!node || !(node instanceof GoDependenciesTreeNode)) {
            return;
        }
        const credentialsSet: boolean = this._treesManager.connectionManager.areCredentialsSet();
        let hoverText: string = `### Details from GoCenter:\n\n`;
        if (credentialsSet) {
            hoverText = this.getDetailsFromXray(node) + '\n\n' + hoverText;
        } else {
            if (node.topIssue.severity !== Severity.Normal) {
                let summary: string = this.getSeveritySummary(node.componentMetadata?.vulnerabilities?.severity);
                hoverText += `${summary ? `**Vulnerabilities**: ${summary}\n\n` : ``}`;
            }
            hoverText += this.createLicensesText(node.componentMetadata?.licenses);
        }
        hoverText +=
            ` ${node.componentMetadata?.description ? `**Description**: ${node.componentMetadata.description}\n\n` : ''}` +
            this.createLatestVersionText(node.componentMetadata?.latest_version) +
            this.createStarsText(node.componentMetadata?.stars);
        return new vscode.Hover(new vscode.MarkdownString(hoverText));
    }

    /**
     * Creates a string from 'ISeverityCount' in markdown syntax.
     * The result string contains all the severities with an icon corresponding to the severities level,
     *
     * @param severities - Severities to parse.
     * @returns Returns Markdown text of all vulnerabilities found.
     */
    private getSeveritySummary(severities: ISeverityCount): string {
        if (!severities) {
            return '';
        }
        let summary: string = '';
        for (let [severityLevel, numOfSeverity] of Object.entries(severities)) {
            if (numOfSeverity > 0) {
                summary += `![severity.icon](${SeverityUtils.getIcon(
                    SeverityUtils.getSeverity(severityLevel),
                    true
                )}) ${severityLevel} (${numOfSeverity}) &nbsp;`;
            }
        }
        return summary;
    }

    private createLatestVersionText(latestVersion: string) {
        return latestVersion ? `**Latest Version**: ${latestVersion}\n\n` : '';
    }

    private createStarsText(stars: number) {
        return stars ? `**Stars**: ${stars} ★\n\n` : '';
    }
}
