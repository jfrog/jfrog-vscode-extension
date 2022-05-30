import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectDetails } from '../../../types/component';
import { GeneralInfo } from '../../../types/generalInfo';
import { NpmGlobalScopes, NpmUtils, ScopedNpmProject } from '../../../utils/npmUtils';
import { ScanUtils } from '../../../utils/scanUtils';
import { YarnUtils } from '../../../utils/yarnUtils';
import { TreesManager } from '../../treesManager';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { RootNode } from './rootTree';

export class YarnTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(workspaceFolder: string, private _projectToScan: ProjectDetails, private _treesManager: TreesManager, parent?: DependenciesTreeNode) {
        super(workspaceFolder, parent);
    }

    public refreshDependencies(quickScan: boolean) {
        let yarnListFailed: boolean = false;
        let listResults: any;
        try {
            listResults = this.runYarnList();
        } catch (error) {
            this._treesManager.logManager.logError(<any>error, !quickScan);
            this._treesManager.logManager.logMessage(
                'Possible cause: The project needs to be installed by Yarn. Install it by running "yarn install" from "' +
                    this.workspaceFolder +
                    '".',
                'INFO'
            );
            yarnListFailed = true;
        }
        if (!yarnListFailed) {
            this.populateDependencyTree(this, listResults?.data?.trees, quickScan);
        }

        const productionScope: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.PRODUCTION);
        productionScope.loadProjectDetailsFromFile(path.join(this.workspaceFolder, 'package.json'));

        this.generalInfo = new GeneralInfo(
            productionScope.projectName + (yarnListFailed ? ' [Not installed]' : ''),
            productionScope.projectVersion,
            [],
            this.workspaceFolder,
            YarnUtils.PKG_TYPE
        );
        this.label = productionScope.projectName ? productionScope.projectName : path.join(this.workspaceFolder, 'yarn.lock');
    }

    private populateDependencyTree(dependencyTreeNode: DependenciesTreeNode, nodes: any[], quickScan: boolean) {
        if (!nodes) {
            return;
        }
        for (let node of nodes) {
            // Shadow dependencies does not always contain exact version, and therefore we should skip them.
            if (node.shadow) {
                continue;
            }
            const scope: string = NpmUtils.getDependencyScope(node.name);
            let lastIndexOfAt: number = node.name.lastIndexOf('@');
            let dependencyName: string = node.name.substring(0, lastIndexOfAt);
            let dependencyVersion: string = node.name.substring(lastIndexOfAt + 1);

            let generalInfo: GeneralInfo = new GeneralInfo(dependencyName, dependencyVersion, scope !== '' ? [scope] : [], '', YarnUtils.PKG_TYPE);
            let hasRealChildren: boolean = this.hasRealChildren(node.children);
            let treeCollapsibleState: vscode.TreeItemCollapsibleState = hasRealChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;
            let componentId: string = dependencyName + ':' + dependencyVersion;
            if (!quickScan || !this._treesManager.scanCacheManager.isValid(componentId)) {
                this._projectToScan.add(YarnTreeNode.COMPONENT_PREFIX + componentId);
            }

            let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependencyTreeNode);
            if (hasRealChildren) {
                this.populateDependencyTree(child, node.children, quickScan);
            }
        }
    }

    /**
     * Return true if the child dependencies contain any non shadowed dependency.
     * @param childDependencies - Child dependencies at 'yarn list' results
     * @returns true if the child dependencies contain any non shadowed dependency.
     */
    private hasRealChildren(childDependencies: any[]): boolean {
        if (!childDependencies) {
            return false;
        }
        for (let child of childDependencies) {
            if (!child.shadow) {
                return true;
            }
        }
        return false;
    }

    private runYarnList(): any {
        return JSON.parse(ScanUtils.executeCmd('yarn list --json --no-progress', this.workspaceFolder).toString());
    }
}
