import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { License } from '../types/license';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';
import {BuildsNode} from "./dependenciesTree/dependenciesRoot/buildsTree";
import {BuildGeneralInfo, Status} from "../types/buildGeneralinfo";

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
        // Build node - Show build details.
        if (this._selectedNode instanceof BuildsNode) {
            return Promise.resolve(this.getBuildChildren());
        }
        // Component details node
        let children: (TreeDataHolder | LicensesNode)[] = [
            new TreeDataHolder('Artifact', this._selectedNode.generalInfo.artifactId),
            new TreeDataHolder('Version', this._selectedNode.generalInfo.version)
        ];
        children.push(new TreeDataHolder('Type', this._selectedNode.generalInfo.pkgType));
        if (this._selectedNode.generalInfo.scopes.length > 0) {
            children.push(new TreeDataHolder('Scopes', this._selectedNode.generalInfo.scopes.join(',')));
        }
        children.push(new TreeDataHolder('Issues count', String(this._selectedNode.issues.size())));
        let path: string = this._selectedNode.generalInfo.path;
        if (path) {
            children.push(new TreeDataHolder('Path', path));
        }
        children.push(new LicensesNode(this._selectedNode.licenses));
        return Promise.resolve(children);
    }

    getBuildChildren(element?: any): Thenable<any[]> {
        if (!this._selectedNode) {
            return Promise.resolve([]);
        }
        const bgi: BuildGeneralInfo = <BuildGeneralInfo> this._selectedNode.generalInfo;
        let children: (TreeDataHolder)[] = [
            new TreeDataHolder('Status', Status[bgi.status]),
            new TreeDataHolder('Date', bgi.started),
            new TreeDataHolder('Branch', bgi.vcs.branch),
            new TreeDataHolder('Commit Message', bgi.vcs.message)
        ];
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
