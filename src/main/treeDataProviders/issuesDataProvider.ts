import * as vscode from 'vscode';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { Issue } from '../types/issue';
import { Severity, SeverityUtils } from '../types/severity';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';

/**
 * The component issues details tree.
 */
export class IssuesDataProvider implements vscode.TreeDataProvider<IssueNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<IssueNode | undefined> = new vscode.EventEmitter<IssueNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<IssueNode | undefined> = this._onDidChangeTreeData.event;
    private _selectedNode: DependenciesTreeNode | undefined;

    constructor(protected _scanCacheManager: ScanCacheManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: any): vscode.TreeItem {
        let treeItem: vscode.TreeItem;
        if (element instanceof IssueNode) {
            treeItem = <IssueNode>element;
        } else {
            let holder: TreeDataHolder = <TreeDataHolder>element;
            treeItem = new vscode.TreeItem(holder.key);
            treeItem.description = holder.value;
            if (holder.link) {
                treeItem.command = {
                    command: 'vscode.open',
                    arguments: [vscode.Uri.parse(holder.link)]
                } as vscode.Command;
            }
        }

        return treeItem;
    }

    getChildren(element?: IssueNode): Thenable<any[]> {
        // No selected node - No component issues details view
        if (!this._selectedNode) {
            return Promise.resolve([]);
        }
        // Show only collapsed issue details if no issue selected
        if (!element) {
            let children: IssueNode[] = [];
            this._selectedNode.issues.forEach(xrayIssueId => {
                if (xrayIssueId.issue_id === Issue.MISSING_COMPONENT.summary) {
                    return;
                }
                let issue: Issue | undefined = this._scanCacheManager.getIssue(xrayIssueId.issue_id);
                if (!issue) {
                    return;
                }
                let issueNode: IssueNode = new IssueNode(
                    issue.severity,
                    issue.summary,
                    issue.cves,
                    issue.issueType,
                    xrayIssueId.component,
                    issue.fixedVersions
                );
                children.push(issueNode);
            });
            // Sort issues by severity
            children.sort((lhs, rhs) => rhs.severity - lhs.severity);
            return Promise.resolve(children);
        }
        // Issue selected - Show severity, type, component and fixed versions
        let children: TreeDataHolder[] = [
            new TreeDataHolder('Severity', SeverityUtils.getString(element.severity)),
            new TreeDataHolder('Component', element.component)
        ];
        let cves: string[] | undefined = element.cves;
        if (cves && cves.length > 0) {
            children.push(new TreeDataHolder('CVEs', cves.toString()));
        }
        let fixedVersions: string[] | undefined = element.fixedVersions;
        if (fixedVersions && fixedVersions.length > 0) {
            children.push(new TreeDataHolder('Fixed Versions', fixedVersions.join(', ')));
        }
        return Promise.resolve(children);
    }

    public selectNode(selectedNode: DependenciesTreeNode) {
        this._selectedNode = selectedNode;
        this.refresh();
    }
}

export class IssueNode extends vscode.TreeItem {
    constructor(
        readonly severity: Severity,
        readonly summary: string,
        readonly cves?: string[],
        readonly issueType?: string,
        readonly component?: string,
        readonly fixedVersions?: string[]
    ) {
        super(summary, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = SeverityUtils.getIcon(severity ? severity : Severity.Normal);
    }
}
