import * as vscode from 'vscode';
import { GavGeneralInfo } from '../../../types/gavGeneralinfo';
import { MavenUtils } from '../../../utils/mavenUtils';
import { PomTree } from '../../../utils/pomTree';
import { TreesManager } from '../../treesManager';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';
import { ProjectDetails } from '../../../types/projectDetails';

export class MavenTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'gav://';

    constructor(fullPath: string, private _treesManager: TreesManager, parent?: DependenciesTreeNode) {
        super(fullPath, PackageType.Maven, parent);
        MavenUtils.pathToNode.set(fullPath, this);
    }

    /**
     * Create MavenTreeNodes from prototypeTree's nodes and add them as a child
     * @param quickScan - True to allow reading from scan cache.
     * @param prototypeTree - Tree that each node contain pom.xml path.
     */
    public async refreshDependencies(prototypeTree: PomTree, parentDependencies?: string[]): Promise<ProjectDetails[]> {
        const mavenProjectDetails: ProjectDetails[] = [];
        const [group, name, version] = prototypeTree.pomGav.split(':');
        this.generalInfo = new GavGeneralInfo(group, name, version, [], this.workspaceFolder, PackageType.Maven);
        this.label = group + ':' + name;
        this.projectDetails.name = this.label;
        // Add project details of root node.
        mavenProjectDetails.push(this.projectDetails);
        let rawDependenciesList: string[] | undefined = await prototypeTree.getRawDependencies(this._treesManager);
        if (!!rawDependenciesList && rawDependenciesList.length > 0) {
            rawDependenciesList = MavenUtils.filterParentDependencies(rawDependenciesList, parentDependencies) || rawDependenciesList;
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            this.populateDependenciesTree(this, rawDependenciesList, { index: 0 });
        }
        for (const childPom of prototypeTree.children) {
            const dependenciesTreeNode: MavenTreeNode = new MavenTreeNode(childPom.pomPath, this._treesManager, this);
            await dependenciesTreeNode.refreshDependencies(childPom, rawDependenciesList);
            if (dependenciesTreeNode.children.length === 0) {
                this.children.splice(this.children.indexOf(dependenciesTreeNode), 1);
            } else {
                // Add project details of child node.
                mavenProjectDetails.push(dependenciesTreeNode.projectDetails);
            }
        }
        return mavenProjectDetails;
    }

    /**
     * Parse rawDependenciesList in order to build dependencies for the parent node
     * @param parent - The parent node of the dependency nodes, which will be created from raw dependencies list
     * @param rawDependenciesList - Raw text of dependencies
     * @param rawDependenciesPtr - Pointer to current index in raw dependencies list
     * @param quickScan - True to allow reading from scan cache.
     */
    private populateDependenciesTree(parent: DependenciesTreeNode, rawDependenciesList: string[], rawDependenciesPtr: { index: number }) {
        for (; rawDependenciesPtr.index < rawDependenciesList.length; rawDependenciesPtr.index++) {
            let dependency: string = rawDependenciesList[rawDependenciesPtr.index];
            const [group, name, version, scope] = MavenUtils.getDependencyInfo(dependency);
            const gavGeneralInfo: GavGeneralInfo = new GavGeneralInfo(group, name, version, [scope], '', PackageType.Maven);
            let treeCollapsibleState: vscode.TreeItemCollapsibleState = this.isParent(rawDependenciesList, rawDependenciesPtr.index)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;
            let child: DependenciesTreeNode = new DependenciesTreeNode(gavGeneralInfo, treeCollapsibleState, parent);
            child.label = group + ':' + name;
            let componentId: string = gavGeneralInfo.getComponentId();
            this.projectDetails.addDependency(MavenTreeNode.COMPONENT_PREFIX + componentId);

            child.dependencyId = MavenTreeNode.COMPONENT_PREFIX + componentId;
            if (rawDependenciesPtr.index + 1 < rawDependenciesList.length) {
                while (
                    rawDependenciesPtr.index + 1 < rawDependenciesList.length &&
                    this.isChild(dependency, rawDependenciesList[rawDependenciesPtr.index + 1])
                ) {
                    rawDependenciesPtr.index++;
                    this.populateDependenciesTree(child, rawDependenciesList, rawDependenciesPtr);
                }
                if (!this.isBrother(dependency, rawDependenciesList[rawDependenciesPtr.index + 1])) {
                    return;
                }
            }
        }
    }

    /** @override */
    public shallowClone(): MavenTreeNode {
        const clone: MavenTreeNode = new MavenTreeNode(this.workspaceFolder, this._treesManager, undefined);
        clone.generalInfo = this.generalInfo;
        clone.licenses = this.licenses;
        clone.issues = this.issues;
        clone.topSeverity = this.topSeverity;
        clone.label = this.label;
        clone.collapsibleState = this.collapsibleState;
        return clone;
    }

    /**
     * In order to understand if two consecutive dependencies are child/brother/parent one to another, we compare the number of white spaces e.g.:
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
        return rawDependenciesLine?.search(/\w/);
    }

    private isEndOfDependenciesList(rawDependenciesList: string[], index: number) {
        return rawDependenciesList.length <= index;
    }

    private isParent(rawDependenciesList: string[], index: number): boolean {
        return !this.isEndOfDependenciesList(rawDependenciesList, index + 1) && this.isUpperInTree(rawDependenciesList, index, index + 1);
    }

    private isChild(toCompare: string, against: string) {
        return this.getDependenciesLevel(against) > this.getDependenciesLevel(toCompare);
    }

    private isBrother(toCompare: string, against: string) {
        return this.getDependenciesLevel(against) === this.getDependenciesLevel(toCompare);
    }

    private isUpperInTree(rawDependenciesList: string[], toCompare: number, against: number) {
        return this.getDependenciesLevel(rawDependenciesList[against]) > this.getDependenciesLevel(rawDependenciesList[toCompare]);
    }

    /** @override */
    public setUpgradableDependencies() {
        this.children.forEach(child => {
            // In case of a multi module pom.
            if (child instanceof RootNode) {
                child.children.forEach(c => this.upgradableDependencies(this._treesManager.buildsTreesProvider.scanCacheManager, c));
            } else {
                this.upgradableDependencies(this._treesManager.buildsTreesProvider.scanCacheManager, child);
            }
        });
    }
}
