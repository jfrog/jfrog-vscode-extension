import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { BuildGeneralInfo, Status } from '../types/buildGeneralinfo';
import { ILicenseCacheObject } from '../types/licenseCacheObject';
import { ILicenseKey } from '../types/licenseKey';
import { Consts } from '../utils/consts';
import { IconsPaths } from '../utils/iconsPaths';
import { BuildsNode } from './dependenciesTree/ciNodes/buildsTree';
import { CiTitleNode } from './dependenciesTree/ciNodes/ciTitleNode';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from './utils/treeDataHolder';

/**
 * The General section in the 'Dependency Details' panel.
 */
export class GeneralDetailsDataProvider extends vscode.TreeItem implements vscode.TreeDataProvider<any> {
    // The selected node in the dependency tree. The General details are represented by this node.
    private _selectedNode!: DependenciesTreeNode;
    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

    constructor(private _scanCacheManager: ScanCacheManager) {
        super('General', vscode.TreeItemCollapsibleState.Collapsed);
    }

    public get selectedNode(): DependenciesTreeNode {
        return this._selectedNode;
    }

    public set selectedNode(value: DependenciesTreeNode) {
        this._selectedNode = value;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: any): vscode.TreeItem {
        if (element instanceof LicensesNode || element instanceof GeneralDetailsDataProvider) {
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
        if (holder.icon) {
            treeItem.iconPath = holder.icon;
        }
        return treeItem;
    }

    getChildren(element?: any): Thenable<any[]> {
        // Licenses node - Return licenses
        if (element instanceof LicensesNode) {
            return Promise.resolve(element.getChildren());
        }
        // Build node - Show build details.
        if (this._selectedNode instanceof BuildsNode) {
            return Promise.resolve(this.getBuildChildren());
        }
        // Component details node
        let children: (TreeDataHolder | LicensesNode)[] = [new TreeDataHolder('Artifact', this._selectedNode.generalInfo.artifactId)];
        // If this is a title node, show version only if not empty.
        if (!(this._selectedNode instanceof CiTitleNode && !this._selectedNode.generalInfo.version)) {
            children.push(new TreeDataHolder('Version', this._selectedNode.generalInfo.version));
        }
        children.push(new TreeDataHolder('Type', this._selectedNode.generalInfo.pkgType));
        const scopes: string[] = this._selectedNode.generalInfo.scopes;
        if (scopes.length > 0 && !this.isNoneScope(scopes)) {
            children.push(new TreeDataHolder('Scopes', this._selectedNode.generalInfo.scopes.join(',')));
        }
        children.push(new TreeDataHolder('Issues count', String(this._selectedNode.issues.size())));
        let path: string = this._selectedNode.generalInfo.path;
        if (path) {
            children.push(new TreeDataHolder('Path', path));
        }
        if (!(this._selectedNode instanceof CiTitleNode)) {
            children.push(new LicensesNode(this._scanCacheManager, this._selectedNode.licenses));
        }
        return Promise.resolve(children);
    }

    private isNoneScope(scopes: string[]): boolean {
        return scopes.length === 1 && scopes[0] === 'None';
    }

    getBuildChildren(): Thenable<any[]> {
        if (!this._selectedNode) {
            return Promise.resolve([]);
        }
        const bgi: BuildGeneralInfo = <BuildGeneralInfo>this._selectedNode.generalInfo;
        const status: string = Status[bgi.status];
        let children: TreeDataHolder[] = [
            new TreeDataHolder('Status', status),
            new TreeDataHolder('Date', bgi.startedReadable),
            new TreeDataHolder('Branch', bgi.vcs.branch),
            new TreeDataHolder('Commit Message', bgi.vcs.message)
        ];
        let link: string = bgi.path;
        if (link) {
            children.push(new TreeDataHolder('Build Log', link, link));
        }
        return Promise.resolve(children);
    }

    public selectNode(selectedNode: DependenciesTreeNode) {
        this._selectedNode = selectedNode;
        this.refresh();
    }
}

export class LicensesNode extends vscode.TreeItem {
    constructor(private _scanCacheManager: ScanCacheManager, private _licenses: Collections.Set<ILicenseKey>) {
        super('Licenses', vscode.TreeItemCollapsibleState.Expanded);
    }

    public getChildren(): any[] {
        let children: any[] = [];

        this._licenses.forEach(licenseKey => {
            let license: ILicenseCacheObject | undefined = this._scanCacheManager.getLicense(licenseKey.licenseName);
            if (!license) {
                return;
            }
            let icon: string | undefined;
            if (licenseKey.violated) {
                icon = IconsPaths.VIOLATED_LICENSE;
            }
            children.push(new TreeDataHolder(this.createLicenseString(license), license.moreInfoUrl, license.moreInfoUrl, icon));
        });
        return children;
    }

    public createLicenseString(license: ILicenseCacheObject): string {
        if (!license.fullName && this.isFullNameEmpty(license)) {
            return license.name;
        }
        return license.fullName + ' (' + license.name + ')';
    }

    public isFullNameEmpty(license: ILicenseCacheObject) {
        return !license.fullName || license.fullName === Consts.UNKNOWN_LICENSE_FULL_NAME;
    }
}
