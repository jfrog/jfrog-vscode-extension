import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'jfrog-client-js';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { TreesManager } from '../../treesManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { NugetUtils } from '../../../utils/nugetUtils';
import { RootNode } from './rootTree';

export class NugetTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'nuget://';

    constructor(
        workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(workspaceFolder, parent, '');
    }

    public async refreshDependencies(quickScan: boolean, project: any) {
        this.generalInfo = new GeneralInfo(project.name, '', ['None'], this.workspaceFolder, NugetUtils.PKG_TYPE);
        this.label = project.name;
        this.populateDependenciesTree(this, project.dependencies, quickScan);
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any, quickScan: boolean) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let id: string = dependency.id;
            let version: string = dependency.version;
            let childDependencies: any = dependency.dependencies;
            if (id && version && childDependencies) {
                let generalInfo: GeneralInfo = new GeneralInfo(id, version, ['None'], '', NugetUtils.PKG_TYPE);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState =
                    childDependencies.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode, '');
                let combined: string = id + ':' + version;
                if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(combined)) {
                    this._componentsToScan.add(new ComponentDetails(NugetTreeNode.COMPONENT_PREFIX + combined));
                }
                this.populateDependenciesTree(child, childDependencies, quickScan);
            }
        }
    }
}
