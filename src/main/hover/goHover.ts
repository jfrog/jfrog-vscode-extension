import * as path from 'path';
import * as vscode from 'vscode';
import * as Collections from 'typescript-collections';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractHoverProvider } from './abstractHoverProvider';
import { GoUtils } from '../utils/goUtils';
import { GoDependenciesTreeNode } from '../treeDataProviders/dependenciesTree/goDependenciesTreeNode';
import { Severity, SeverityUtils } from '../types/severity';
import { ISeverityCount } from '../goCenterClient/model/SeverityCount';
import { Issue } from '../types/issue';

export class GoHover extends AbstractHoverProvider {
    private static readonly XRAY_IN_GOCENTER_URL: string = 'https://www.jfrog.com/confluence/display/XRAY2X/Xray+Vulnerability+Scanning+in+GoCenter';
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
        let hoverText: vscode.MarkdownString = new vscode.MarkdownString(
            `${node.componentMetadata?.description ? `${node.componentMetadata.description.slice(0, 100)}` : ''}${
                node.componentMetadata.description?.length > 100 ? ` ...` : ` `
            }[ReadMe](${node.componentMetadata?.gocenter_readme_url})${
                node.componentMetadata?.gocenter_metrics_url ? ` | [Metrics-Info](${node.componentMetadata.gocenter_metrics_url})\n\n` : '\n\n'
            }`
        );
        if (credentialsSet) {
            hoverText.appendMarkdown(
                this.createLatestVersionText(node.componentMetadata?.latest_version) + this.createLicensesText(this.licensesToMarkdown(node.licenses))
            );
            if (node.topIssue.severity !== Severity.Normal) {
                let [summary, issuesCount] = this.getIssueSummary(node.issues);
                hoverText.appendMarkdown(`${issuesCount ? `${issuesCount}\n\n` : ``}` + `${summary ? `${summary}\n\n` : ``} `);
            }
        } else {
            if (node.topIssue.severity === Severity.Normal) {
                hoverText.appendMarkdown(
                    `[No vulnerabilities found](${GoHover.XRAY_IN_GOCENTER_URL})\n\n${this.createLatestVersionText(
                        node.componentMetadata?.latest_version
                    )}` + this.createLicensesText(node.componentMetadata?.licenses)
                );
            } else {
                let [summary, issuesCount] = this.getSeveritySummary(node.componentMetadata?.vulnerabilities?.severity);
                hoverText.appendMarkdown(
                    `${this.createLatestVersionText(node.componentMetadata?.latest_version)}` +
                        this.createLicensesText(node.componentMetadata?.licenses) +
                        `${issuesCount ? `${issuesCount}\n\n` : ``}` +
                        `${
                            summary
                                ? `${summary} | CVE information available in: [JFrog GoCenter](${node.componentMetadata?.vulnerabilities?.gocenter_security_url})\n\n`
                                : ``
                        } `
                );
            }
        }
        return new vscode.Hover(hoverText);
    }

    /**
     * Creates two strings from 'ISeverityCount', both are in markdown syntax.
     * The first string is one line contains all the severities with an icon corresponding to the severities level,
     * the second is the sum of all severities.
     *
     * @param severities - Severities to parse.
     * @returns [string, string] Returns Markdown text of the total vulnerabilities found.
     */
    private getSeveritySummary(severities: ISeverityCount): [string, string] {
        if (!severities) {
            return ['', ''];
        }
        let summary: string = '';
        let TotalVulnerabilities: string = '';
        let totalNumOfSeverities: number = 0;
        for (let [severityLevel, numOfSeverity] of Object.entries(severities)) {
            if (numOfSeverity > 0) {
                totalNumOfSeverities += numOfSeverity;
                summary += `![severity.icon](${SeverityUtils.getIcon(
                    SeverityUtils.getSeverity(severityLevel)
                )}) ${severityLevel} (${numOfSeverity}) `;
            }
        }
        if (summary !== '') {
            TotalVulnerabilities = `**Total vulnerabilities found: ${totalNumOfSeverities}**`;
        }
        return [summary, TotalVulnerabilities];
    }

    private getIssueSummary(issues: Collections.Set<Issue>): [string, string] {
        if (!issues) {
            return ['', ''];
        }
        let summary: string = '';
        let TotalVulnerabilities: string = '';
        let totalNumOfSeverities: Array<number> = new Array<number>(Object.keys(Severity).length / 2);
        issues.forEach(issue => {
            totalNumOfSeverities[issue.severity] = totalNumOfSeverities[issue.severity] ? totalNumOfSeverities[issue.severity] + 1 : 1;
        });
        for (let i: number = 0; i < totalNumOfSeverities.length; i++) {
            if (!totalNumOfSeverities[i]) {
                continue;
            }
            summary += `![severity.icon](${SeverityUtils.getIcon(i)}) ${SeverityUtils.getString(i)} (${totalNumOfSeverities[i]}) `;
        }
        if (summary !== '') {
            TotalVulnerabilities = `**Total vulnerabilities found: ${totalNumOfSeverities.reduce(
                (accumulator, currentValue) => accumulator + currentValue
            )}**`;
        }
        return [summary, TotalVulnerabilities];
    }

    private createLicensesText(licenses: string[]) {
        return `${licenses ? ` | License: ${licenses}\n\n` : '\n\n'}`;
    }

    private createLatestVersionText(latestVersion: string) {
        return latestVersion ? `Latest Version: ${latestVersion.slice(0, 10)}${latestVersion.length > 10 ? `...` : ``} ` : '';
    }
}
