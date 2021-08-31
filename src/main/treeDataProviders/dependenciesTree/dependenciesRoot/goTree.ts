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
        let goModGraph: PackageDependencyPair[] = [];
        let goList: string[] = [];
        let rootPackageName: string = '';
        try {
            rootPackageName = this.getRootPackageName();
            goModGraph = this.runGoModGraph();
            goList = this.runGoList();
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
     * run "go list -m" to get the name of the root module.
     * @returns the root package name
     */
    private getRootPackageName(): string {
        return ScanUtils.executeCmd('go list -m', this.workspaceFolder)
            .toString()
            .trim();
    }

    /**
     * Run "go mod graph" in order to create the dependency tree later on.
     * @returns a list of package to dependency pairs
     */
    private runGoModGraph(): PackageDependencyPair[] {
        let goModGraphOutput: string[] = ScanUtils.executeCmd('go mod graph', this.workspaceFolder)
            .toString()
            .split(/\s+/);
        goModGraphOutput.pop(); // Remove the last new line

        // For a given index i, if i is even (i%2==0) goModGraphOutput[i] is the package that depends on goModGraphOutput[i+1]: goModGraphOutput[i] -> goModGraphOutput[i+1].
        // The first lines of the even indices contain no versions. Those are the direct dependencies.
        let results: PackageDependencyPair[] = [];
        for (let i: number = 0; i < goModGraphOutput.length; i += 2) {
            results.push(new PackageDependencyPair(goModGraphOutput[i], goModGraphOutput[i + 1]));
        }
        return results;
    }

    /**
     * Run "go list" to retrieve a list of dependencies which are actually in use in the project.
     * @returns "go list" results.
     */
    private runGoList(): string[] {
        return ScanUtils.executeCmd(`go list -f "{{with .Module}}{{.Path}} {{.Version}}{{end}}" all`, this.workspaceFolder)
            .toString()
            .split(/\n/);
    }

    private buildDependenciesMapAndDirectDeps(goModGraph: PackageDependencyPair[], goList: string[]): Map<string, string[]> {
        let goModGraphIndex: number = 0;

        // Populate direct dependencies
        let directDependenciesGeneralInfos: GeneralInfo[] = [];
        for (; goModGraphIndex < goModGraph.length && !goModGraph[goModGraphIndex].package.includes('@'); goModGraphIndex++) {
            let nameVersionTuple: string[] = this.getNameVersionTuple(goModGraph[goModGraphIndex].dependency);
            directDependenciesGeneralInfos.push(new GeneralInfo(nameVersionTuple[0], nameVersionTuple[1], ['None'], '', GoUtils.PKG_TYPE));
        }

        // Create a set of packages that are actually in use in the project
        let goListPackages: Set<string> = new Set<string>();
        goList.forEach((dependency: string) => {
            goListPackages.add(dependency.replace(' ', '@'));
        });

        // Build dependencies map
        let dependenciesMap: Map<string, string[]> = new Map();
        for (; goModGraphIndex < goModGraph.length; goModGraphIndex++) {
            let dependency: string[] = dependenciesMap.get(goModGraph[goModGraphIndex].package) || [];
            if (!goListPackages.has(goModGraph[goModGraphIndex].dependency)) {
                // If the dependency is included in "go mod graph", but isn't included in "go mod -m all", it means that it's not in use by the project.
                // It can therefore be ignored.
                continue;
            }
            dependency.push(goModGraph[goModGraphIndex].dependency);
            dependenciesMap.set(goModGraph[goModGraphIndex].package, dependency);
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

class PackageDependencyPair {
    constructor(private _package: string, private _dependency: string) {}

    public get package() {
        return this._package;
    }

    public get dependency() {
        return this._dependency;
    }
}
