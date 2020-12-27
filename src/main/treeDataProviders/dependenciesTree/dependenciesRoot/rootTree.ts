import * as vscode from 'vscode';
import { ContextKeys } from '../../../constants/contextKeys';
import { GeneralInfo } from '../../../types/generalInfo';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
export class RootNode extends DependenciesTreeNode {
    constructor(private _workspaceFolder: string, parent?: DependenciesTreeNode, contextValue?: string) {
        super(new GeneralInfo('', '', [], _workspaceFolder, ''), vscode.TreeItemCollapsibleState.Expanded, parent, contextValue);
    }

    get workspaceFolder() {
        return this._workspaceFolder;
    }

    /**
     * Sets the root nodes' context to show the update dependency icon if available.
     */
    public setUpgradableDependencies() {
        this.children.forEach(child => this.upgradableDependencies(child));
    }
    protected upgradableDependencies(node: DependenciesTreeNode) {
        // Node include issues (not including for transitive children) with a fixed version.
        const isRootUpgradable: boolean = node.issues.toArray().some(issue => issue.component === node.componentId && issue.fixedVersions.length > 0);
        if (isRootUpgradable && node.contextValue !== '') {
            node.contextValue += ContextKeys.UPDATE_DEPENDENCY_ENABLED;
        }
    }
}
