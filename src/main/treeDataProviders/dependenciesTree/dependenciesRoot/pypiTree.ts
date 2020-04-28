import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { TreesManager } from '../../treesManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { ScanUtils } from '../../../utils/scanUtils';
import { PypiUtils } from '../../../utils/pypiUtils';

/**
 * Pypi packages can be installed in two different ways:
 * 1. 'pip install [Path to setup.py]' - With this method, the top level in the tree would be the project name.
 * 2. 'pip install -r [Path to requirements.txt]' - With this method, the top level in the tree would be the dependencies of the project.
 */
export class PypiTreeNode extends DependenciesTreeNode {
    private static readonly COMPONENT_PREFIX: string = 'pypi://';

    constructor(
        private _projectDir: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        private _pythonPath: string,
        parent?: DependenciesTreeNode
    ) {
        super(new GeneralInfo('', '', _projectDir, ''), vscode.TreeItemCollapsibleState.Expanded, parent);
    }

    public async refreshDependencies(quickScan: boolean) {
        let pypiList: any;
        try {
            pypiList = JSON.parse(
                ScanUtils.executeCmd(this._pythonPath + ' ' + PypiUtils.PIP_DEP_TREE_SCRIPT + ' --json-tree', this._projectDir).toString()
            );
            this.generalInfo = new GeneralInfo(this._projectDir.replace(/^.*[\\\/]/, ''), '', this._projectDir, PypiUtils.PKG_TYPE);
        } catch (error) {
            this._treesManager.logManager.logError(error, !quickScan);
        }
        this.label = this.generalInfo.artifactId;
        this.populateDependenciesTree(this, pypiList, quickScan);
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any, quickScan: boolean) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let version: string = dependency.installed_version;
            if (version) {
                let childDependencies: any = dependency.dependencies;
                let generalInfo: GeneralInfo = new GeneralInfo(dependency.key, version, '', PypiUtils.PKG_TYPE);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState =
                    childDependencies && childDependencies.length > 0
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode);
                let componentId: string = dependency.key + ':' + version;
                if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(componentId)) {
                    this._componentsToScan.add(new ComponentDetails(PypiTreeNode.COMPONENT_PREFIX + componentId));
                }
                this.populateDependenciesTree(child, childDependencies, quickScan);
            }
        }
    }
}
