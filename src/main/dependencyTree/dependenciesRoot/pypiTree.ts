import * as vscode from 'vscode';
import { DependencyTreeNode } from '../dependencyTreeNode';
import { TreesManager } from '../../treeDataProviders/treesManager';
import { GeneralInfo } from '../../types/generalInfo';
import { ScanUtils } from '../../utils/scanUtils';
import { RootNode } from './rootTree';
import { PackageType } from '../../types/projectType';
import { PypiUtils } from '../../utils/dependency/pypiUtils';

/**
 * Pypi packages can be installed in two different ways:
 * 1. 'pip install [Path to setup.py]' - With this method, the top level in the tree would be the project name.
 * 2. 'pip install -r [Path to requirements.txt]' - With this method, the top level in the tree would be the dependencies of the project.
 */
export class PypiTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'pypi://';

    constructor(workspaceFolder: string, private _treesManager: TreesManager, private _pythonPath: string, parent?: DependencyTreeNode) {
        super(workspaceFolder, PackageType.Python, parent);
    }

    public async refreshDependencies() {
        let pypiList: any;
        try {
            pypiList = JSON.parse(
                ScanUtils.executeCmd(this._pythonPath + ' ' + PypiUtils.PIP_DEP_TREE_SCRIPT + ' --json-tree', this.workspaceFolder).toString()
            );
            this.generalInfo = new GeneralInfo(this.workspaceFolder.replace(/^.*[\\/]/, ''), '', ['None'], this.workspaceFolder, PackageType.Python);
        } catch (error) {
            this._treesManager.logManager.logError(<any>error, true);
        }
        this.projectDetails.name = this.generalInfo.artifactId;
        this.label = this.projectDetails.name;
        this.populateDependenciesTree(this, pypiList);
    }

    private populateDependenciesTree(dependenciesTreeNode: DependencyTreeNode, dependencies: any) {
        if (!dependencies) {
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
                let child: DependencyTreeNode = new DependencyTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode);
                let componentId: string = dependency.key + ':' + version;
                this.projectDetails.addDependency(PypiTreeNode.COMPONENT_PREFIX + componentId);
                child.dependencyId = PypiTreeNode.COMPONENT_PREFIX + componentId;
                this.populateDependenciesTree(child, childDependencies);
            }
        }
    }
}
