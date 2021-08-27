import { ComponentDetails } from 'jfrog-client-js';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { GeneralInfo } from '../../../types/generalInfo';
import { GoUtils } from '../../../utils/goUtils';
import { ScanUtils } from '../../../utils/scanUtils';
import { TreesManager } from '../../treesManager';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { RootNode } from './rootTree';

export class GoTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'go://';
    constructor(
        workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(workspaceFolder, parent);
    }

    public async refreshDependencies(quickScan: boolean) {
        let goModGraph: string[] = [];
        let goList: string[] = [];
        let rootPackageName: string = '';
        try {
            goModGraph = this.runGoModGraph();
            goList = this.runGoList();

            // The project name should be the first line in the go list result
            rootPackageName = goList[0];
        } catch (error) {
            this._treesManager.logManager.logError(error, !quickScan);
            this.label = this.workspaceFolder + ' [Not installed]';
            this.generalInfo = new GeneralInfo(this.label, '', [], this.workspaceFolder, GoUtils.PKG_TYPE);
            return;
        }
        this.generalInfo = new GeneralInfo(rootPackageName, '', ['None'], this.workspaceFolder, GoUtils.PKG_TYPE);
        this.label = rootPackageName;
        if (goModGraph.length === 0) {
            return;
        }
        let dependenciesMap: Map<string, string[]> = this.buildDependenciesMapAndDirectDeps(goModGraph, goList);
        this.children.forEach(child => this.populateDependenciesTree(dependenciesMap, child, quickScan));
    }

    /**
     * Run "go mod graph" in order to create the dependency tree later on.
     * @returns a list of dependencies in the following order:
     * For a given index i, if i is even (i%2==0) results[i] is the package that depends on results[i+1]: results[i] -> results[i+1].
     * The first lines of the even indices contain no versions. Those are the direct dependencies.
     */
    private runGoModGraph(): string[] {
        let results: string[] = ScanUtils.executeCmd('go mod graph', this.workspaceFolder)
            .toString()
            .split(/\s+/);
        results.pop(); // Remove the last new line
        return results;
    }

    /**
     * Run "go list -m all" to retrieve a list of dependencies which are actually in use in the project.
     * @returns "go list -m all" results.
     */
    private runGoList(): string[] {
        return ScanUtils.executeCmd('go list -m all', this.workspaceFolder)
            .toString()
            .split(/\n/);
    }

    private buildDependenciesMapAndDirectDeps(goModGraph: string[], goList: string[]): Map<string, string[]> {
        let goModGraphIndex: number = 0;

        // Populate direct dependencies
        let directDependenciesGeneralInfos: GeneralInfo[] = [];
        for (; goModGraphIndex < goModGraph.length && !goModGraph[goModGraphIndex].includes('@'); goModGraphIndex += 2) {
            let nameVersionTuple: string[] = this.getNameVersionTuple(goModGraph[goModGraphIndex + 1]);
            directDependenciesGeneralInfos.push(new GeneralInfo(nameVersionTuple[0], nameVersionTuple[1], ['None'], '', GoUtils.PKG_TYPE));
        }

        // Create a set of packages that actually in use in the project
        let goListPackages: Set<string> = new Set<string>();
        goList.forEach((dependency: string) => {
            goListPackages.add(dependency.replace(' ', '@'));
        });

        // Build dependencies map
        let dependenciesMap: Map<string, string[]> = new Map();
        for (; goModGraphIndex < goModGraph.length; goModGraphIndex += 2) {
            let dependency: string[] = dependenciesMap.get(goModGraph[goModGraphIndex]) || [];
            if (!goListPackages.has(goModGraph[goModGraphIndex + 1])) {
                // Dependency in "go mod graph" does not actually in use in the project
                continue;
            }
            dependency.push(goModGraph[goModGraphIndex + 1]);
            dependenciesMap.set(goModGraph[goModGraphIndex], dependency);
        }

        // Add direct dependencies to tree
        directDependenciesGeneralInfos.forEach(generalInfo => {
            this.addChild(new DependenciesTreeNode(generalInfo, this.getTreeCollapsibleState(dependenciesMap, generalInfo)));
        });
        return dependenciesMap;
    }

    private populateDependenciesTree(dependenciesMap: Map<string, string[]>, dependenciesTreeNode: DependenciesTreeNode, quickScan: boolean) {
        if (this.hasLoop(dependenciesTreeNode)) {
            return;
        }
        this.addComponentToScan(dependenciesTreeNode, quickScan);
        let childDependencies: string[] =
            dependenciesMap.get(dependenciesTreeNode.generalInfo.artifactId + '@v' + dependenciesTreeNode.generalInfo.version) || [];
        childDependencies.forEach(childDependency => {
            let nameVersionTuple: string[] = this.getNameVersionTuple(childDependency);
            let generalInfo: GeneralInfo = new GeneralInfo(nameVersionTuple[0], nameVersionTuple[1], ['None'], '', GoUtils.PKG_TYPE);
            let grandchild: DependenciesTreeNode = new DependenciesTreeNode(
                generalInfo,
                this.getTreeCollapsibleState(dependenciesMap, generalInfo),
                dependenciesTreeNode
            );
            this.populateDependenciesTree(dependenciesMap, grandchild, quickScan);
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

    private addComponentToScan(dependenciesTreeNode: DependenciesTreeNode, quickScan: boolean) {
        let componentId: string = dependenciesTreeNode.generalInfo.artifactId + ':' + dependenciesTreeNode.generalInfo.version;
        if (!quickScan || !this._treesManager.scanCacheManager.isValid(componentId)) {
            this._componentsToScan.add(new ComponentDetails(GoTreeNode.COMPONENT_PREFIX + componentId));
        }
    }

    private getNameVersionTuple(value: string): string[] {
        let split: string[] = value.split('@v');
        return [split[0], split[1]];
    }

    private getTreeCollapsibleState(dependenciesMap: Map<string, string[]>, generalInfo: GeneralInfo): vscode.TreeItemCollapsibleState {
        return dependenciesMap.has(generalInfo.artifactId + '@v' + generalInfo.version)
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
    }
}
