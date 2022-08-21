import * as path from 'path';
import * as vscode from 'vscode';
import { GeneralInfo } from '../../../types/generalInfo';
import { NpmUtils, ScopedNpmProject } from '../../../utils/npmUtils';
import { ScanUtils } from '../../../utils/scanUtils';
import { YarnUtils } from '../../../utils/yarnUtils';
import { TreesManager } from '../../treesManager';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';

export class YarnTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(workspaceFolder: string, private _treesManager: TreesManager, parent?: DependenciesTreeNode) {
        super(workspaceFolder, PackageType.YARN, parent);
    }

    public refreshDependencies(quickScan: boolean) {
        let yarnListFailed: boolean = false;
        let listResults: any;
        try {
            listResults = this.runYarnList();
        } catch (error) {
            this._treesManager.logManager.logError(<any>error, false);
            this._treesManager.logManager.logMessage(
                'Failed to scan yarn project. Possible cause: The project needs to be installed by Yarn. Install it by running "yarn install" from "' +
                    this.workspaceFolder +
                    '".',
                'INFO',
                true,
                !quickScan
            );
            yarnListFailed = true;
        }
        if (!yarnListFailed) {
            this.populateDependencyTree(this, listResults?.data?.trees, quickScan);
        }

        const yarnProject: ScopedNpmProject = YarnUtils.getYarnProjectDetails(this.workspaceFolder);
        this.generalInfo = new GeneralInfo(
            yarnProject.projectName + (yarnListFailed ? ' [Not installed]' : ''),
            yarnProject.projectVersion,
            [],
            this.workspaceFolder,
            YarnUtils.PKG_TYPE
        );
        this.projectDetails.name = yarnProject.projectName || path.join(this.workspaceFolder, 'yarn.lock');
        this.label = this.projectDetails.name;
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
                this.projectDetails.addDependency(YarnTreeNode.COMPONENT_PREFIX + componentId);
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
