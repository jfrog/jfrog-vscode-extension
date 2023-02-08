import { IGraphRequestModel, IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
import { ConnectionManager } from '../connect/connectionManager';
import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { Configuration } from '../utils/configuration';

/**
 * Supported in Xray >= 3.29.0.
 * Run /scan/graph REST API and populate the cache with the results.
 * When the project key is provided - only violated vulnerabilities should appear in the results. Licenses may mark as violated.
 * When the project key isn't provided - all vulnerabilities and licenses information should appear in the results.
 */
export class GraphScanLogic {
    constructor(private _connectionManager: ConnectionManager) {}

    /**
     * Run async /scan/graph REST API and return the result
     * The graph will be flatten and reduce to unique entries only
     * @param graphRoot - the dependency graph to scan
     * @param progress - the progress for this scan
     * @param checkCanceled - method to check if the action was canceled
     * @returns the result of the scan
     */
    public async scan(graphRoot: RootNode, progress: XrayScanProgress, checkCanceled: () => void): Promise<IGraphResponse> {
        let graphRequest: IGraphRequestModel = {
            component_id: graphRoot.generalInfo.artifactId,
            nodes: this.getFlattenRequestModelNodes(graphRoot, new Set<string>())
        } as IGraphRequestModel;
        if (!graphRequest.nodes || graphRequest.nodes.length === 0) {
            // No dependencies to scan
            return {} as IGraphResponse;
        }
        return this._connectionManager.scanWithGraph(
            graphRequest,
            progress,
            checkCanceled,
            Configuration.getProjectKey(),
            Configuration.getWatches()
        );
    }

    /**
     * Flatten the dependency graph and remove duplications recursively.
     * @param dependency - the dependency root to get its flatten children
     * @param components - the components that are already discovered to remove duplication
     * @returns - flatten unique dependency entries of the root children
     */
    private getFlattenRequestModelNodes(dependency: DependenciesTreeNode, components: Set<string>): IGraphRequestModel[] | undefined {
        let nodes: IGraphRequestModel[] = [];
        for (let child of dependency.children) {
            if (child.dependencyId && !components.has(child.dependencyId)) {
                components.add(child.dependencyId);
                nodes.push({
                    component_id: child.dependencyId
                } as IGraphRequestModel);
            }
            let childNodes: IGraphRequestModel[] | undefined = this.getFlattenRequestModelNodes(child, components);
            if (childNodes) {
                nodes.push(...childNodes);
            }
        }
        // To reduce the sent payload, we don't populate empty graph nodes with an empty array
        return nodes.length > 0 ? nodes : undefined;
    }
}
