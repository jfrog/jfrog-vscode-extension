import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { GeneralInfo } from '../../../types/generalInfo';
import { RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';
import { PipDepTree } from '../../../types/pipDepTree';

/**
 * Pypi packages can be installed in two different ways:
 * 1. 'pip install [Path to setup.py]' - With this method, the top level in the tree would be the project name.
 * 2. 'pip install -r [Path to requirements.txt]' - With this method, the top level in the tree would be the dependencies of the project.
 */
export class PypiTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'pypi://';

    constructor(filePath: string, parent?: DependenciesTreeNode) {
        super(filePath, PackageType.Python, parent);
        this.generalInfo = new GeneralInfo(this.fullPath.replace(/^.*[\\/]/, ''), '', ['None'], this.fullPath, PackageType.Python);
        this.projectDetails.name = this.generalInfo.artifactId;
        this.label = this.projectDetails.name;
    }

    public async refreshDependencies(dependencyTree: PipDepTree[]) {
        this.populateDependenciesTree(this, dependencyTree);
    }

    protected populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: PipDepTree[]) {
        if (!dependencies || dependencies.length === 0) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let version: string = dependency.installed_version;
            if (version) {
                let childDependencies: any = dependency.dependencies;
                let generalInfo: GeneralInfo = new GeneralInfo(dependency.key, version, ['None'], '', PackageType.Python);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState =
                    childDependencies && childDependencies.length > 0
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode);
                let componentId: string = dependency.key + ':' + version;
                this.projectDetails.addDependency(PypiTreeNode.COMPONENT_PREFIX + componentId);
                child.dependencyId = PypiTreeNode.COMPONENT_PREFIX + componentId;
                this.populateDependenciesTree(child, childDependencies);
            }
        }
    }
}
