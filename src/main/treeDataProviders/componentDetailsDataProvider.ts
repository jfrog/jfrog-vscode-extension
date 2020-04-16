import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { Issue } from '../types/issue';
import { License } from '../types/license';
import { SeverityUtils } from '../types/severity';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';
import { IComponentMetadata } from '../goCenterClient/model/ComponentMetadata';
import { GoDependenciesTreeNode } from './dependenciesTree/goDependenciesTreeNode';

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
        if (element instanceof LicensesNode || element instanceof GoCenterNode) {
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
        // Go Center node - Return Go Center Information
        if (element instanceof GoCenterNode) {
            return Promise.resolve(element.getChildren());
        }
        // Component details node
        let children: (TreeDataHolder | LicensesNode | GoCenterNode)[] = [
            new TreeDataHolder('Artifact', this._selectedNode.generalInfo.artifactId),
            new TreeDataHolder('Version', this._selectedNode.generalInfo.version),
            new TreeDataHolder('Type', this._selectedNode.generalInfo.pkgType),
            new LicensesNode(this._selectedNode.licenses),
            new TreeDataHolder('Issues count', String(this._selectedNode.issues.size()))
        ];
        if (this._selectedNode instanceof GoDependenciesTreeNode) {
            children.push(new GoCenterNode(this._selectedNode.componentMetadata));
        }
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

class GoCenterNode extends vscode.TreeItem {
    constructor(private _goCenter: IComponentMetadata) {
        super('Go Center Information', vscode.TreeItemCollapsibleState.Expanded);
    }

    public getChildren(): any[] {
        let children: any[] = [];
        children.push(
            new TreeDataHolder('Description', String(this._goCenter.description)),
            new TreeDataHolder('Latest Version', String(this._goCenter.latest_version)),
            new TreeDataHolder('stars', String(this._goCenter.stars)),
            new TreeDataHolder('ReadMe', 'Click Here', String(this._goCenter.gocenter_readme_url)),
            new TreeDataHolder('Metrics', 'Click Here', String(this._goCenter.gocenter_metrics_url))
        );
        return children;
    }
}
