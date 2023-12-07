import * as vscode from 'vscode';
import * as path from 'path';
import { GeneralInfo } from '../../../types/generalInfo';
import { ProjectDetails } from '../../../types/projectDetails';
import { PackageType } from '../../../types/projectType';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { DependencyScanResults } from '../../../types/workspaceIssuesDetails';
import { Utils } from '../../../utils/utils';
import { IImpactGraph, IImpactGraphNode } from 'jfrog-ide-webview';

export enum BuildTreeErrorType {
    NotInstalled = '[Not Installed]',
    NotSupported = '[Not Supported]'
}

export class RootNode extends DependenciesTreeNode {
    public static IMPACT_PATHS_LIMIT: number = 20;
    private _projectDetails: ProjectDetails;
    private _workspaceFolder: string;

    private _buildError?: BuildTreeErrorType;

    constructor(private _fullPath: string, packageType: PackageType, parent?: DependenciesTreeNode, contextValue?: string) {
        super(new GeneralInfo('', '', [], _fullPath, packageType), vscode.TreeItemCollapsibleState.Expanded, parent, contextValue);
        this._projectDetails = new ProjectDetails(_fullPath, packageType);
        this._workspaceFolder = path.dirname(_fullPath);
    }

    public get projectDetails(): ProjectDetails {
        return this._projectDetails;
    }

    public set projectDetails(value: ProjectDetails) {
        this._projectDetails = value;
    }

    public get buildError() {
        return this._buildError;
    }

    public set buildError(value: BuildTreeErrorType | undefined) {
        this._buildError = value;
    }

    public get fullPath() {
        return this._fullPath;
    }

    public set fullPath(value: string) {
        this._fullPath = value;
    }

    public get workspaceFolder() {
        return this._workspaceFolder;
    }

    public set workspaceFolder(wsFolder: string) {
        this._workspaceFolder = wsFolder;
    }

    public createEmptyScanResultsObject(): DependencyScanResults {
        return {
            type: this._projectDetails.type,
            name: Utils.getLastSegment(this.fullPath),
            fullPath: this.fullPath
        } as DependencyScanResults;
    }

    public flattenRootChildren(): RootNode[] {
        let result: RootNode[] = [];
        for (let child of this.children) {
            if (child instanceof RootNode) {
                result.push(child, ...child.flattenRootChildren());
            }
        }
        return result;
    }

    /**
     * Retrieves the impact paths of all child components, recursively from a given root,
     * The number of impact paths collected may be limited by the '{@link RootNode.IMPACT_PATHS_LIMIT}'.
     * @param vulnerableDependencyName - the name of the component used to build a path to the root.
     * @param componentWithIssue -  the version of the component used to build a path to the root.
     */
    public createImpactedGraph(vulnerableDependencyName: string, vulnerableDependencyVersion: string): IImpactGraph {
        const vulnerableDependencyId: string = vulnerableDependencyName + ':' + vulnerableDependencyVersion
        // Ensure we hit the direct impact first
        RootNode.moveNodeToFirst(this.children, vulnerableDependencyId)
        return RootNode.collectPaths(vulnerableDependencyId, this.children, 0);

    }

    /**
     * Moves the node with the specified component ID to the first position in the impactPaths array.
     * @param impactPaths - The array of DependenciesTreeNode objects.
     * @param targetComponentId - The component ID of the node to be moved to the first position.
     */
    private static moveNodeToFirst(impactPaths: DependenciesTreeNode[], targetComponentId: string): void {
        let targetNodeIndex: number = impactPaths.findIndex(node => node.componentId === targetComponentId);
        if (targetNodeIndex === -1) {
            return;
        }
        let targetNode: DependenciesTreeNode = impactPaths[targetNodeIndex];
        impactPaths.splice(targetNodeIndex, 1);
        impactPaths.unshift(targetNode);
    }

    private static collectPaths(vulnerableDependencyId: string, children: DependenciesTreeNode[], totalDependencyAppearances: number): IImpactGraph {
        let impactPaths: IImpactGraphNode[] = [];
        for (let child of children) {
            if (totalDependencyAppearances === RootNode.IMPACT_PATHS_LIMIT) {
                break;
            }
            if (impactPaths.find(node => node.name === child.componentId)) {
                // Loop encountered
                continue;
            }

            if (child.componentId === vulnerableDependencyId) {
                RootNode.appendDirectImpact(impactPaths, child.componentId);
                totalDependencyAppearances++;
            }

            let indirectImpact: IImpactGraph = RootNode.collectPaths(vulnerableDependencyId, child.children, totalDependencyAppearances);
            RootNode.appendIndirectImpact(impactPaths, child.componentId, indirectImpact);
            totalDependencyAppearances = indirectImpact.pathsLimit || totalDependencyAppearances;
        }
        return { root: { children: impactPaths }, pathsLimit: totalDependencyAppearances } as IImpactGraph;
    }

    public static createImpactPathLimit(totalPath: number | undefined): number | undefined {
        if (totalPath === RootNode.IMPACT_PATHS_LIMIT) {
            return totalPath;
        }
        return undefined;
    }

    private static appendDirectImpact(impactPaths: IImpactGraphNode[], componentId: string): void {
        impactPaths.push({ name: componentId } as IImpactGraphNode);
    }

    private static appendIndirectImpact(impactPaths: IImpactGraphNode[], componentId: string, indirectImpact: IImpactGraph): void {
        if (!!indirectImpact.root.children?.length) {
            impactPaths.push({
                name: componentId,
                children: indirectImpact.root.children
            } as IImpactGraphNode);
        }
    }
}
