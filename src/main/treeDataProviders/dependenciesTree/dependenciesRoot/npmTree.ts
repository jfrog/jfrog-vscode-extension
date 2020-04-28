import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { TreesManager } from '../../treesManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { ScanUtils } from '../../../utils/scanUtils';
import { NpmUtils } from '../../../utils/npmUtils';

export class NpmTreeNode extends DependenciesTreeNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(
        private _workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(new GeneralInfo('', '', _workspaceFolder, ''), vscode.TreeItemCollapsibleState.Expanded, parent);
    }

    public async refreshDependencies(quickScan: boolean) {
        let npmList: any;
        try {
            npmList = JSON.parse(ScanUtils.executeCmd('npm ls --json', this._workspaceFolder).toString());
        } catch (error) {
            this._treesManager.logManager.logError(error, !quickScan);
            this._treesManager.logManager.logMessage(
                'Possible cause: The project needs to be installed by npm. Install it by running "npm install" from "' + this._workspaceFolder + '".',
                'INFO'
            );
            npmList = JSON.parse(error.stdout.toString());
            npmList.name += ' [Not installed]';
        }
        this.generalInfo = new GeneralInfo(npmList.name, npmList.version, this._workspaceFolder, NpmUtils.PKG_TYPE);
        this.label = npmList.name ? npmList.name : path.join(this._workspaceFolder, 'package.json');
        this.populateDependenciesTree(this, npmList.dependencies, quickScan);
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any, quickScan: boolean) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let version: string = dependency.version;
            if (version) {
                let childDependencies: any = dependency.dependencies;
                let generalInfo: GeneralInfo = new GeneralInfo(key, version, '', NpmUtils.PKG_TYPE);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState = childDependencies
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode);
                let componentId: string = key + ':' + version;
                if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(componentId)) {
                    this._componentsToScan.add(new ComponentDetails(NpmTreeNode.COMPONENT_PREFIX + componentId));
                }
                this.populateDependenciesTree(child, childDependencies, quickScan);
            }
        }
    }
}
