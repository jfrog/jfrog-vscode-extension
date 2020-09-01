import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { TreesManager } from '../../treesManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { NugetUtils } from '../../../utils/nugetUtils';

export class NugetTreeNode extends DependenciesTreeNode {
    private static readonly COMPONENT_PREFIX: string = 'nuget://';

    constructor(
        private _workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(new GeneralInfo('', '', _workspaceFolder, ''), vscode.TreeItemCollapsibleState.Expanded, parent, '');
    }

    public async refreshDependencies(quickScan: boolean, project: any) {
        this.generalInfo = new GeneralInfo(project.name, '', this._workspaceFolder, NugetUtils.PKG_TYPE);
        this.label = project.name;
        this.populateDependenciesTree(this, project.dependencies, quickScan);
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any, quickScan: boolean) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let nameVersionTuple: string[] = this.getNameVersionTuple(dependency.dependency.id);
            let name: string = nameVersionTuple[0];
            let version: string = nameVersionTuple[1];
            if (version) {
                let childDependencies: any = dependency.directDependencies;
                let generalInfo: GeneralInfo = new GeneralInfo(name, version, '', NugetUtils.PKG_TYPE);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState =
                    childDependencies.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode, '');
                if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(dependency.dependency.id)) {
                    this._componentsToScan.add(new ComponentDetails(NugetTreeNode.COMPONENT_PREFIX + dependency.dependency.id));
                }
                this.populateDependenciesTree(child, childDependencies, quickScan);
            }
        }
    }

    private getNameVersionTuple(value: string): string[] {
        let split: string[] = value.split(':');
        return [split[0], split[1]];
    }
}
