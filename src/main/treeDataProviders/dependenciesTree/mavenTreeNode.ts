import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { GeneralInfo } from '../../types/generalInfo';
import { TreesManager } from '../treesManager';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { GavGeneralInfo } from '../../types/gavGeneralinfo';
import { PomTree } from '../../utils/pomTree';
import { MavenUtils } from '../../utils/mavenUtils';

export class MavenTreeNode extends DependenciesTreeNode {
    private static readonly COMPONENT_PREFIX: string = 'gav://';

    constructor(
        private _workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(new GeneralInfo('', '', _workspaceFolder, ''), vscode.TreeItemCollapsibleState.None, parent);
        MavenUtils.pathToNode.set(_workspaceFolder, this);
    }

    get workspaceFolder() {
        return this._workspaceFolder;
    }

    /**
     * Create MavenTreeNodes from prototypeTree's nodes and add them as a child
     * @param quickScan - True to allow reading from scan cache.
     * @param prototypeTree - Tree that each node contain pom.xml path.
     */
    public refreshDependencies(quickScan: boolean, prototypeTree: PomTree) {
        const [group, name, version] = prototypeTree.pomId.split(':');
        this.generalInfo = new GavGeneralInfo(group, name, version, this._workspaceFolder, MavenUtils.PKG_TYPE);
        this.label = group + ':' + name;
        let rawDependenciesList: string[] = prototypeTree.rawDependencies.split(/\r?\n/).filter(line => line.trim() !== '');
        if (rawDependenciesList.length > 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.populateDependenciesTree(this, rawDependenciesList, { index: 0 }, quickScan);
        }
        for (const childPom of prototypeTree.children) {
            const dependenciesTreeNode: MavenTreeNode = new MavenTreeNode(childPom.pomPath, this._componentsToScan, this._treesManager, this);
            MavenUtils.FilterParentDependencies(this.children, childPom);
            dependenciesTreeNode.refreshDependencies(quickScan, childPom);
        }
    }

    /**
     * Parse rawDependenciesList in order to build dependencies for the parent node
     * @param parent - The parent node of the dependency nodes, which will be created from raw Dependencies Lis
     * @param rawDependenciesList - raw text of dependencies
     * @param rawDependenciesPtr - Pointer to current index in raw dependencies list
     * @param quickScan - True to allow reading from scan cache.
     */
    private populateDependenciesTree(
        parent: DependenciesTreeNode,
        rawDependenciesList: string[],
        rawDependenciesPtr: { index: number },
        quickScan: boolean
    ) {
        for (; rawDependenciesPtr.index < rawDependenciesList.length; rawDependenciesPtr.index++) {
            let dependency: string = rawDependenciesList[rawDependenciesPtr.index];
            const [group, name, version] = MavenUtils.getDependencyInfo(dependency);
            const gavGeneralInfo: GavGeneralInfo = new GavGeneralInfo(group, name, version, '', MavenUtils.PKG_TYPE);
            let treeCollapsibleState: vscode.TreeItemCollapsibleState = this.isParent(rawDependenciesList, rawDependenciesPtr.index)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;
            let child: DependenciesTreeNode = new DependenciesTreeNode(gavGeneralInfo, treeCollapsibleState, parent);
            child.label = group + ':' + name;
            let componentId: string = gavGeneralInfo.getComponentId();
            if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(componentId)) {
                this._componentsToScan.add(new ComponentDetails(MavenTreeNode.COMPONENT_PREFIX + componentId));
            }
            if (rawDependenciesPtr.index + 1 < rawDependenciesList.length) {
                while (this.isChild(dependency, rawDependenciesList[rawDependenciesPtr.index + 1])) {
                    rawDependenciesPtr.index++;
                    this.populateDependenciesTree(child, rawDependenciesList, rawDependenciesPtr, quickScan);
                }
                if (!this.isBrother(dependency, rawDependenciesList[rawDependenciesPtr.index + 1])) {
                    return;
                }
            }
        }
    }

    /**
     * In order to understand if two consecutive dependencies are child/brother/parent one to another, we compare the number of white spaces i.g.:
     *  brothers:
     *  +- hsqldb:hsqldb:jar:1.8.0.10:runtime
     *  +- javax.servlet:servlet-api:jar:2.5:provided
     *
     * org.springframework:spring-aop is the parent of opalliance:aopalliance
     *   \- org.springframework:spring-aop:jar:2.5.6:compile
     *    +- aopalliance:aopalliance:jar:1.0:compile
     *
     * @param rawDependenciesLine - sing line of raw dependencies list
     * @returns number of white spaces from the beginning of the line
     */
    private getDependenciesLevel(rawDependenciesLine: string): number {
        return rawDependenciesLine.search(/\w/);
    }

    private isEndOfDependenciesList(rawDependenciesList: string[], index: number) {
        return rawDependenciesList.length <= index;
    }

    private isParent(RawDependenciesList: string[], index: number): boolean {
        return !this.isEndOfDependenciesList(RawDependenciesList, index + 1) && this.isUpperInTree(RawDependenciesList, index, index + 1);
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
