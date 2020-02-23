import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { GeneralInfo } from '../../types/generalInfo';
import { TreesManager } from '../treesManager';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { GavGeneralInfo } from '../../types/gavGeneralinfo';
import { pathToNode, PKG_TYPE, getDependencyInfo, FilterParentDependencies } from '../../utils/mavenUtils';
import { PomTree } from '../../utils/prototypePomTree';

export class MavenTreeNode extends DependenciesTreeNode {
    private static readonly COMPONENT_PREFIX: string = 'gav://';

    constructor(
        private _workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(new GeneralInfo('', '', _workspaceFolder, ''), vscode.TreeItemCollapsibleState.None, parent);
        pathToNode.set(_workspaceFolder, this);
    }

    get workspaceFolder() {
        return this._workspaceFolder;
    }
    /**
     *
     * @param quickScan
     * @param projectTree Tree that each node contain pom.xml path.
     * @param projectDependenciesList
     * @param mavenTreeNode
     */
    public refreshDependencies(quickScan: boolean, projectTree: PomTree, mavenTreeNode: MavenTreeNode[]) {
        const [group, name, version] = projectTree.pomId.split(':');
        this.generalInfo = new GavGeneralInfo(group, name, version, this._workspaceFolder, PKG_TYPE);
        this.label = group + ':' + name;
        let rawDependenciesList: string[] = projectTree.rawDependencies.split(/\r?\n/).filter(line => line.trim() !== '');
        // Pass a pointer to sync index while Recursion
        if (rawDependenciesList.length > 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.populateDependenciesTree(this, rawDependenciesList, { index: 0 }, quickScan);
        }
        for (const iterator of projectTree.children) {
            const dependenciesTreeNode: MavenTreeNode = new MavenTreeNode(iterator.pomPath, this._componentsToScan, this._treesManager, this);
            FilterParentDependencies(this.children, iterator);
            mavenTreeNode.push(dependenciesTreeNode);
            dependenciesTreeNode.refreshDependencies(quickScan, iterator, mavenTreeNode);
        }
    }

    private populateDependenciesTree(parent: DependenciesTreeNode, rawDependenciesList: string[], pointer: { index: number }, quickScan: boolean) {
        for (; pointer.index < rawDependenciesList.length; pointer.index++) {
            let dependency: string = rawDependenciesList[pointer.index];
            const [group, name, version] = getDependencyInfo(dependency);
            const gavGeneralInfo: GavGeneralInfo = new GavGeneralInfo(group, name, version, '', PKG_TYPE);
            let treeCollapsibleState: vscode.TreeItemCollapsibleState = this.isParent(rawDependenciesList, pointer.index)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;
            let child: DependenciesTreeNode = new DependenciesTreeNode(gavGeneralInfo, treeCollapsibleState, parent);
            child.label = group + ':' + name;
            let componentId: string = gavGeneralInfo.getComponentId();
            if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(componentId)) {
                this._componentsToScan.add(new ComponentDetails(MavenTreeNode.COMPONENT_PREFIX + componentId));
            }
            if (pointer.index + 1 < rawDependenciesList.length) {
                while (this.isChild(dependency, rawDependenciesList[pointer.index + 1])) {
                    pointer.index++;
                    this.populateDependenciesTree(child, rawDependenciesList, pointer, quickScan);
                }
                if (!this.isBrother(dependency, rawDependenciesList[pointer.index + 1])) {
                    return;
                }
            }
        }
    }

    private getDependenciesLevel(str: string): number {
        return str.search(/[A-Za-z0-9]/);
    }

    private isEndOfDependenciesList(RawDependenciesList: string[], index: number) {
        return RawDependenciesList.length === 0 || RawDependenciesList.length <= index;
    }

    private isParent(RawDependenciesList: string[], index: number): boolean {
        if (
            !this.isEndOfDependenciesList(RawDependenciesList, index) &&
            !this.isEndOfDependenciesList(RawDependenciesList, index + 1) &&
            this.isUpperInTree(RawDependenciesList, index, index + 1)
        ) {
            return true;
        }
        return false;
    }

    private isChild(toCompare: string, against: string) {
        return this.getDependenciesLevel(against) > this.getDependenciesLevel(toCompare);
    }

    private isBrother(toCompare: string, against: string) {
        return this.getDependenciesLevel(against) === this.getDependenciesLevel(toCompare);
    }

    private isUpperInTree(RawDependenciesList: string[], toCompare: number, against: number) {
        return this.getDependenciesLevel(RawDependenciesList[against]) > this.getDependenciesLevel(RawDependenciesList[toCompare]);
    }
}
