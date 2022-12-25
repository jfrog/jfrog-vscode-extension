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
    constructor(protected _connectionManager: ConnectionManager) {}

    /**
     * Run async /scan/graph REST API and return the result
     * @param graphRoot - the dependency graph to scan
     * @param flatten - if true the graph will be faltten and reduce to unique entries only, otherwise grpah will be sent as is
     * @param progress - the progress for this scan
     * @param checkCanceled - method to check if the action was cancled
     * @returns the result of the scan
     */
    public async scan(graphRoot: RootNode, flatten: boolean, progress: XrayScanProgress, checkCanceled: () => void): Promise<IGraphResponse> {
        let graphRequest: IGraphRequestModel = {
            component_id: graphRoot.generalInfo.artifactId,
            nodes: flatten ? this.getFlattenRequestModelNodes(graphRoot, new Set<string>) : this.getGraphRequestModelNodes(graphRoot)
        } as IGraphRequestModel;
        
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
            let childNodes: IGraphRequestModel[] | undefined = this.getFlattenRequestModelNodes(child,components);
            if (childNodes) {
                nodes.push(...childNodes);
            }
        }
        // To reduce the sent payload, we don't populate empty graph nodes with an empty array
        return nodes.length > 0 ? nodes : undefined;
    }

    /**
     * Convert the dependnecies graph to the request model
     * @param dependency - the graph we want to convert
     * @returns IGraphRequestModel to send the scan
     */
    private getGraphRequestModelNodes(dependency: DependenciesTreeNode): IGraphRequestModel[] | undefined {
        let nodes: IGraphRequestModel[] = [];
        if (dependency.children.length > 0) {
            for (let child of dependency.children) {
                nodes.push({
                    component_id: child.dependencyId,
                    nodes: this.getGraphRequestModelNodes(child)
                } as IGraphRequestModel);
            }
        }
        // To reduce the sent payload, we don't populate empty graph nodes with an empty array
        return nodes.length > 0 ? nodes : undefined;
    }
}
