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
    public static IMPACT_PATHS_LIMIT: number = 50;
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
     * @param root - the root to get it's children impact
     * @param componentWithIssue - the component to generate the impact path for it
     * @param size - the total size of the impacted path
     */
    public createImpactedGraph(vulnerableDependencyname: string, vulnerableDependencyversion: string): IImpactGraph {
        return RootNode.collectPaths(vulnerableDependencyname + ':' + vulnerableDependencyversion, this.children, 0);
    }

    private static collectPaths(vulnerableDependencyId: string, children: DependenciesTreeNode[], size: number) {
        let impactPaths: IImpactGraphNode[] = [];
        for (let child of children) {
            if (impactPaths.find(node => node.name === child.componentId)) {
                // Loop encountered
                continue;
            }

            if (child.componentId === vulnerableDependencyId) {
                if (size < RootNode.IMPACT_PATHS_LIMIT) {
                    RootNode.appendDirectImpact(impactPaths, child.componentId);
                }
                size++;
            }

            let indirectImpact: IImpactGraph = this.collectPaths(vulnerableDependencyId, child.children, size);
            RootNode.appendIndirectImpact(impactPaths, child.componentId, indirectImpact);
            size = indirectImpact.pathsCount ?? size;
        }
        return { root: { children: impactPaths }, pathsCount: size } as IImpactGraph;
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
