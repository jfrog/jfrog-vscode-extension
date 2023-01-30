import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { GeneralInfo } from '../../../types/generalInfo';
import { RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';

export class NugetTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'nuget://';

    constructor(workspaceFolder: string, parent?: DependenciesTreeNode) {
        super(workspaceFolder, PackageType.Nuget, parent, '');
    }

    public refreshDependencies(project: any) {
        this.generalInfo = new GeneralInfo(project.name, '', ['None'], this.workspaceFolder, PackageType.Nuget);
        this.label = project.name;
        this.projectDetails.name = project.name;
        this.populateDependenciesTree(this, project.dependencies);
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let id: string = dependency.id;
            let version: string = dependency.version;
            let childDependencies: any = dependency.dependencies;
            if (id && version && childDependencies) {
                let generalInfo: GeneralInfo = new GeneralInfo(id, version, ['None'], '', PackageType.Nuget);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState =
                    childDependencies.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode, '');
                let combined: string = id + ':' + version;
                this.projectDetails.addDependency(NugetTreeNode.COMPONENT_PREFIX + combined);
                child.dependencyId = NugetTreeNode.COMPONENT_PREFIX + combined;
                this.populateDependenciesTree(child, childDependencies);
            }
        }
    }
}
