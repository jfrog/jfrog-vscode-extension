import * as vscode from 'vscode';
import * as path from 'path';
import { ContextKeys } from '../../../constants/contextKeys';
import { ScanCacheManager } from '../../../cache/scanCacheManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { ProjectDetails } from '../../../types/projectDetails';
import { PackageType } from '../../../types/projectType';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
export class RootNode extends DependenciesTreeNode {
    private _projectDetails: ProjectDetails;
    private _workspaceFolder: string;

    constructor(private _fullPath: string, packageType: PackageType, parent?: DependenciesTreeNode, contextValue?: string) {
        super(new GeneralInfo('', '', [], _fullPath, packageType), vscode.TreeItemCollapsibleState.Expanded, parent, contextValue);
        this._projectDetails = new ProjectDetails(_fullPath, packageType);
        this._workspaceFolder = path.dirname(_fullPath);
    }

    public get projectDetails(): ProjectDetails {
        return this._projectDetails;
    }

    public set projectDetails(value: ProjectDetails) {
        this._projectDetails = value;
    }

    public get fullPath() {
        return this._fullPath;
    }

    public set fullPath(value: string) {
        this._fullPath = value;
    }

    public get workspaceFolder() {
        return this._workspaceFolder;
    }

    public set workspaceFolder(wsFolder: string) {
        this._workspaceFolder = wsFolder;
    }

    /**
     * Sets the root nodes' context to show the update dependency icon if available.
     */
    public setUpgradableDependencies(scanCacheManager: ScanCacheManager) {
        this.children.forEach(child => this.upgradableDependencies(scanCacheManager, child));
    }

    protected upgradableDependencies(scanCacheManager: ScanCacheManager, node: DependenciesTreeNode) {
        if (!node.contextValue) {
            return;
        }
        // Look for issues with fixed versions in direct dependencies.
        const isRootUpgradable: boolean = node.issues
            .toArray()
            .map(issueKey => scanCacheManager.getIssue(issueKey.issue_id))
            .filter(issue => issue)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            .some(issue => issue!.fixedVersions?.length > 0);
        if (isRootUpgradable) {
            node.contextValue += ContextKeys.UPDATE_DEPENDENCY_ENABLED;
        }
    }
}
