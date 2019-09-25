import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { Issue } from '../types/issue';
import { License } from '../types/license';
import { SeverityUtils } from '../types/severity';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';

/**
 * The component details tree.
 */
export class ComponentDetailsDataProvider implements vscode.TreeDataProvider<any> {
    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;
    private _selectedNode: DependenciesTreeNode | undefined;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: any): vscode.TreeItem {
        if (element instanceof LicensesNode) {
            return element;
        }
        let holder: TreeDataHolder = <TreeDataHolder>element;
        let treeItem: vscode.TreeItem = new vscode.TreeItem(holder.key);
        treeItem.description = holder.value;
        if (holder.link) {
            treeItem.command = {
                command: 'vscode.open',
                arguments: [vscode.Uri.parse(holder.link)]
            } as vscode.Command;
        }
        return treeItem;
    }

    getChildren(element?: any): Thenable<any[]> {
        // No selected node - No component details view
        if (!this._selectedNode) {
            return Promise.resolve([]);
        }
        // Licenses node - Return licenses
        if (element instanceof LicensesNode) {
            return Promise.resolve(element.getChildren());
        }
        // Component details node
        let children: (TreeDataHolder | LicensesNode)[] = [
            new TreeDataHolder('Artifact', this._selectedNode.generalInfo.artifactId),
            new TreeDataHolder('Version', this._selectedNode.generalInfo.version),
            new TreeDataHolder('Type', this._selectedNode.generalInfo.pkgType),
            new LicensesNode(this._selectedNode.licenses),
            new TreeDataHolder('Issues count', String(this._selectedNode.issues.size()))
        ];
        let path: string = this._selectedNode.generalInfo.path;
        if (path) {
            children.push(new TreeDataHolder('Path', path));
        }
        let topIssue: Issue = this._selectedNode.topIssue;
        if (topIssue) {
            children.push(new TreeDataHolder('Top Issue Severity', SeverityUtils.getString(topIssue.severity)));
            children.push(new TreeDataHolder('Top Issue Type', topIssue.issueType));
        }
        return Promise.resolve(children);
    }

    public selectNode(selectedNode: DependenciesTreeNode) {
        this._selectedNode = selectedNode;
        this.refresh();
    }
}

export class LicensesNode extends vscode.TreeItem {
    constructor(private _licenses: Collections.Set<License>) {
        super('Licenses', vscode.TreeItemCollapsibleState.Expanded);
    }

    public getChildren(): any[] {
        let children: any[] = [];
        this._licenses.forEach(license => {
            let moreInfoUrl: string | undefined = license.moreInfoUrl ? license.moreInfoUrl[0] : undefined;
            children.push(new TreeDataHolder(license.createLicenseString(), moreInfoUrl, moreInfoUrl));
        });
        return children;
    }
}
