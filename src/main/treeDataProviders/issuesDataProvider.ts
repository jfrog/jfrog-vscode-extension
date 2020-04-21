import * as vscode from 'vscode';
import { Severity, SeverityUtils } from '../types/severity';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';
import { Issue } from '../types/issue';

/**
 * The component issues details tree.
 */
export class IssuesDataProvider implements vscode.TreeDataProvider<IssueNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<IssueNode | undefined> = new vscode.EventEmitter<IssueNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<IssueNode | undefined> = this._onDidChangeTreeData.event;
    private _selectedNode: DependenciesTreeNode | undefined;

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
            this._selectedNode.issues.forEach(issue => {
                if (issue.summary === Issue.MISSING_COMPONENT.summary) {
                    return;
                }
                let issueNode: IssueNode = new IssueNode(
                    issue.severity,
                    issue.summary,
                    issue.issueType,
                    issue.component,
                    issue.fixedVersions,
                    issue.gocenter_security_url
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
        let fixedVersions: string[] | undefined = element.fixedVersions;
        if (fixedVersions && fixedVersions.length > 0) {
            children.push(new TreeDataHolder('Fixed Versions', fixedVersions.toString()));
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
        readonly issueType?: string,
        readonly component?: string,
        readonly fixedVersions?: string[],
        readonly gocenter_security_url?: string
    ) {
        super(summary, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = SeverityUtils.getIcon(severity ? severity : Severity.Normal);
    }
}
