import * as exec from 'child_process';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { ScanCacheManager } from '../../scanCache/scanCacheManager';
import { GeneralInfo } from '../../types/generalInfo';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { PypiUtils } from '../../utils/pypiUtils';

export class PypiTreeNode extends DependenciesTreeNode {

    private static readonly COMPONENT_PREFIX: string = 'pypi://';
    private static readonly PACKAGE_TYPE: string = 'pypi';

    constructor(
        private _projectDir: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _scanCacheManager: ScanCacheManager,
        private _pythonPath: string,
        parent?: DependenciesTreeNode
    ) {
        super(new GeneralInfo('', '', _projectDir, ''), vscode.TreeItemCollapsibleState.Expanded, parent);
    }

    public async refreshDependencies(quickScan: boolean) {
        let pypiList: any;
        try {
            pypiList = JSON.parse(
                exec.execSync(this._pythonPath + ' ' + PypiUtils.PIP_DEP_TREE_SCRIPT + ' --json-tree', { cwd: this._projectDir }).toString()
            );
            this.generalInfo = new GeneralInfo(this._projectDir.replace(/^.*[\\\/]/, ''), '', this._projectDir, PypiTreeNode.PACKAGE_TYPE);
        } catch (error) {
            vscode.window.showWarningMessage(error.toString());
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
                let generalInfo: GeneralInfo = new GeneralInfo(dependency.key, version, '', PypiTreeNode.PACKAGE_TYPE);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState =
                    childDependencies && childDependencies.length > 0
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode);
                let componentId: string = dependency.key + ':' + version;
                if (!quickScan || !this._scanCacheManager.validateOrDelete(componentId)) {
                    this._componentsToScan.add(new ComponentDetails(PypiTreeNode.COMPONENT_PREFIX + componentId));
                }
                this.populateDependenciesTree(child, childDependencies, quickScan);
            }
        }
    }
}
