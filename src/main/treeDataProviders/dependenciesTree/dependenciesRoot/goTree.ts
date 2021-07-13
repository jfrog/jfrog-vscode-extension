import * as exec from 'child_process';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'jfrog-client-js';
import { GeneralInfo } from '../../../types/generalInfo';
import { GoUtils } from '../../../utils/goUtils';
import { ScanUtils } from '../../../utils/scanUtils';
import { TreesManager } from '../../treesManager';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { RootNode } from './rootTree';

export class GoTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'go://';

    private _dependenciesMap: Map<string, string[]> = new Map();

    constructor(
        workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(workspaceFolder, parent);
    }

    public async refreshDependencies(quickScan: boolean) {
        let goList: string[] = [];
        let rootPackageName: string = '';
        try {
            goList = ScanUtils.executeCmd('go mod graph', this.workspaceFolder)
                .toString()
                .split(/\s+/);
            goList.pop(); // Remove the last new line
            rootPackageName = this.getModuleName();
        } catch (error) {
            this._treesManager.logManager.logError(error, !quickScan);
            this.label = this.workspaceFolder + ' [Not installed]';
            this.generalInfo = new GeneralInfo(this.label, '', [], this.workspaceFolder, GoUtils.PKG_TYPE);
            return;
        }
        this.generalInfo = new GeneralInfo(rootPackageName, '', ['None'], this.workspaceFolder, GoUtils.PKG_TYPE);
        this.label = rootPackageName;
        if (goList.length === 0) {
            return;
        }
        this.buildDependenciesMapAndDirectDeps(goList);
        this.children.forEach(child => this.populateDependenciesTree(child, quickScan));
    }

    private buildDependenciesMapAndDirectDeps(goList: string[]) {
        let i: number = 0;

        // Populate direct dependencies
        let directDependenciesGeneralInfos: GeneralInfo[] = [];
        for (; i < goList.length && !goList[i].includes('@'); i += 2) {
            let nameVersionTuple: string[] = this.getNameVersionTuple(goList[i + 1]);
            directDependenciesGeneralInfos.push(new GeneralInfo(nameVersionTuple[0], nameVersionTuple[1], ['None'], '', GoUtils.PKG_TYPE));
        }

        // Build dependencies map
        for (; i < goList.length; i += 2) {
            let dependency: string[] = this._dependenciesMap.get(goList[i]) || [];
            dependency.push(goList[i + 1]);
            this._dependenciesMap.set(goList[i], dependency);
        }

        // Add direct dependencies to tree
        directDependenciesGeneralInfos.forEach(generalInfo => {
            this.addChild(new DependenciesTreeNode(generalInfo, this.getTreeCollapsibleState(generalInfo)));
        });
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, quickScan: boolean) {
        if (this.hasLoop(dependenciesTreeNode)) {
            return;
        }
        this.addComponentToScan(dependenciesTreeNode, quickScan);
        let childDependencies: string[] =
            this._dependenciesMap.get(dependenciesTreeNode.generalInfo.artifactId + '@v' + dependenciesTreeNode.generalInfo.version) || [];
        childDependencies.forEach(childDependency => {
            let nameVersionTuple: string[] = this.getNameVersionTuple(childDependency);
            let generalInfo: GeneralInfo = new GeneralInfo(nameVersionTuple[0], nameVersionTuple[1], ['None'], '', GoUtils.PKG_TYPE);
            let grandchild: DependenciesTreeNode = new DependenciesTreeNode(
                generalInfo,
                this.getTreeCollapsibleState(generalInfo),
                dependenciesTreeNode
            );
            this.populateDependenciesTree(grandchild, quickScan);
        });
    }

    private hasLoop(dependenciesTreeNode: DependenciesTreeNode): boolean {
        let parent: DependenciesTreeNode | undefined = dependenciesTreeNode.parent;
        while (parent) {
            if (parent.generalInfo?.getComponentId() === dependenciesTreeNode.generalInfo?.getComponentId()) {
                this._treesManager.logManager.logMessage('Loop detected in ' + dependenciesTreeNode.generalInfo.artifactId, 'DEBUG');
                return true;
            }
            parent = parent.parent;
        }
        return false;
    }

    private getModuleName(): string {
        return exec
            .execSync('go list -m', { cwd: this.workspaceFolder })
            .toString()
            .trim();
    }

    private addComponentToScan(dependenciesTreeNode: DependenciesTreeNode, quickScan: boolean) {
        let componentId: string = dependenciesTreeNode.generalInfo.artifactId + ':' + dependenciesTreeNode.generalInfo.version;
        if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(componentId)) {
            this._componentsToScan.add(new ComponentDetails(GoTreeNode.COMPONENT_PREFIX + componentId));
        }
    }

    private getNameVersionTuple(value: string): string[] {
        let split: string[] = value.split('@v');
        return [split[0], split[1]];
    }

    private getTreeCollapsibleState(generalInfo: GeneralInfo): vscode.TreeItemCollapsibleState {
        return this._dependenciesMap.has(generalInfo.artifactId + '@v' + generalInfo.version)
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
    }
}
