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
    private static readonly goCenterUrl: string = 'https://www.jfrog.com/confluence/display/XRAY2X/Xray+Vulnerability+Scanning+in+GoCenter';
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

    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        let node: DependenciesTreeNode | undefined = this.getNodeByLocation(document, position);
        if (!node || !(node instanceof GoDependenciesTreeNode)) {
            return;
        }
        const xrayUser: boolean = this._treesManager.connectionManager.areCredentialsSet();
        let licenses: string[] = [];

        let hoverText: vscode.MarkdownString = new vscode.MarkdownString(
            `${node.goCenter?.description ? `${node.goCenter.description.slice(0, 100)}` : ''}${
                node.goCenter.description.length > 100 ? ` ...` : ` `
            }[Read Me](${node.goCenter?.gocenter_readme_url})${
                node.goCenter?.gocenter_metrics_url ? ` | [Metrics-Info](${node.goCenter.gocenter_metrics_url})\n\n` : '\n\n'
            }`
        );
        if (xrayUser) {
            // Transform to markdown syntax
            node.licenses.forEach(license => {
                if (license.moreInfoUrl) {
                    licenses.push('[' + license.name + '](' + license.moreInfoUrl[0] + ')');
                } else {
                    licenses.push(license.name);
                }
            });
            hoverText.appendMarkdown(
                `${node.goCenter?.latest_version ? `Latest Version: : ${node.goCenter.latest_version} ` : ''}` +
                    `${licenses ? ` | License: ${licenses}\n\n` : '\n\n'}`
            );
        } else {
            licenses = node.goCenter.licenses;
            if (node.topIssue.severity === Severity.Normal) {
                hoverText.appendMarkdown(
                    `[No vulnerabilities found](${GoHover.goCenterUrl})${
                        node.goCenter?.latest_version ? ` Latest Version: : ${node.goCenter.latest_version} ` : ''
                    }` + `${licenses ? ` | License: ${licenses}\n\n` : '\n\n'}`
                );
            } else {
                let [summery, totalNum] = this.getSeveritySummery(node.goCenter?.vulnerabilities?.severity);
                hoverText.appendMarkdown(
                    `${totalNum ? `${totalNum} ` : ``}` +
                        `&nbsp; &nbsp; &nbsp; ${
                            node.goCenter?.latest_version
                                ? `Latest Version: : ${node.goCenter.latest_version.slice(0, 5)}${
                                      node.goCenter.latest_version.length > 5 ? `...` : ``
                                  } `
                                : ''
                        }` +
                        `${licenses ? ` | License: ${licenses}\n\n` : '\n\n'}` +
                        `${
                            summery
                                ? `${summery} &nbsp; &nbsp; &nbsp; CVE information available in: [JFrog GoCenter](${node.goCenter?.vulnerabilities?.gocenter_security_url})\n\n`
                                : ``
                        } `
                );
            }
        }
        return new vscode.Hover(hoverText);
    }

    private getSeveritySummery(severities: ISeverityCount): [string, string] {
        if (!severities) {
            return ['', ''];
        }
        let summery: string = '';
        let totalNum: string = '';
        let totalNumOfSeverities: number = 0;
        for (let [severityLevel, numOfSeverity] of Object.entries(severities)) {
            if (numOfSeverity > 0) {
                totalNumOfSeverities += numOfSeverity;
                summery += `![severity.icon](${SeverityUtils.getIcon(
                    SeverityUtils.getSeverity(severityLevel)
                )}) ${severityLevel} (${numOfSeverity})&nbsp; &nbsp;`;
            }
        }
        if (summery !== '') {
            totalNum = `**Total number of vulnerabilities: ${totalNumOfSeverities}**`;
        }
        return [summery, totalNum];
    }
}
