import { IImpactGraph, IImpactGraphNode } from 'jfrog-ide-webview';
import { RootNode } from '../../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { parseBerryLocator } from './yarnBerryLocator';
import { YarnDependency } from './yarnStrategy';

export interface YarnBerryInfoEntry {
    value: string;
    children: { Version?: string; Dependencies?: { descriptor: string; locator: string }[] };
}

export class YarnBerryImpactGraphCreator {
    private static readonly WORKSPACE: string = '@workspace:';
    private static readonly UNVERSIONED_WORKSPACE: string = '0.0.0-use.local';
    private static readonly ROOT_WORKSPACE: string = '@workspace:.';

    private _pathsCount: number = 0;
    private _targetId: string;

    constructor(
        private _dependencyName: string,
        private _dependencyVersion: string,
        private _projectName: string,
        private _infoEntries: YarnBerryInfoEntry[]
    ) {
        this._targetId = this._dependencyName + ':' + this._dependencyVersion;
    }

    public create(): IImpactGraph {
        this._pathsCount = 0;
        const edges: Map<string, string[]> = new Map();
        const rootDependencies: string[] = [];
        const workspaces: string[] = [];
        for (const entry of this._infoEntries) {
            const isWorkspace: boolean = entry.value.includes(YarnBerryImpactGraphCreator.WORKSPACE);
            const id: string | undefined = isWorkspace ? this.getWorkspaceId(entry) : this.getDependencyId(entry.value);
            if (!id) {
                continue;
            }
            const dependencies: string[] = (entry.children.Dependencies ?? [])
                .map(dependency => this.getDependencyId(dependency.locator))
                .filter((dependencyId): dependencyId is string => dependencyId !== undefined);
            edges.set(id, [...new Set([...(edges.get(id) ?? []), ...dependencies])]);
            if (!isWorkspace) {
                continue;
            }
            if (entry.value.endsWith(YarnBerryImpactGraphCreator.ROOT_WORKSPACE)) {
                rootDependencies.push(...dependencies);
                edges.delete(id);
            } else {
                workspaces.push(id);
            }
        }

        const canReachTarget: Set<string> = this.findNodesReachingTarget(edges);
        const children: IImpactGraphNode[] = this.expand([...rootDependencies, ...workspaces], edges, canReachTarget, new Set());
        if (children.length === 0) {
            return {} as IImpactGraph;
        }
        return {
            root: { name: this._projectName, children },
            pathsLimit: RootNode.createImpactPathLimit(this._pathsCount)
        } as IImpactGraph;
    }

    private expand(ids: string[], edges: Map<string, string[]>, canReachTarget: Set<string>, ancestors: Set<string>): IImpactGraphNode[] {
        const nodes: IImpactGraphNode[] = [];
        for (const id of ids) {
            if (this._pathsCount >= RootNode.IMPACT_PATHS_LIMIT) {
                break;
            }
            if (id === this._targetId) {
                this._pathsCount++;
                nodes.push({ name: id });
                continue;
            }
            if (!canReachTarget.has(id) || ancestors.has(id)) {
                continue;
            }
            ancestors.add(id);
            const subPaths: IImpactGraphNode[] = this.expand(edges.get(id) ?? [], edges, canReachTarget, ancestors);
            ancestors.delete(id);
            if (subPaths.length > 0) {
                nodes.push({ name: id, children: subPaths });
            }
        }
        return nodes;
    }

    private findNodesReachingTarget(edges: Map<string, string[]>): Set<string> {
        const parents: Map<string, string[]> = new Map();
        edges.forEach((children, parent) => children.forEach(child => parents.set(child, [...(parents.get(child) ?? []), parent])));
        const reaching: Set<string> = new Set();
        const queue: string[] = [this._targetId];
        while (queue.length > 0) {
            for (const parent of parents.get(queue.pop() as string) ?? []) {
                if (!reaching.has(parent)) {
                    reaching.add(parent);
                    queue.push(parent);
                }
            }
        }
        return reaching;
    }

    private getDependencyId(locator: string): string | undefined {
        const dependency: YarnDependency | undefined = parseBerryLocator(locator);
        return dependency ? dependency.name + ':' + dependency.version : undefined;
    }

    private getWorkspaceId(entry: YarnBerryInfoEntry): string {
        const name: string = entry.value.substring(0, entry.value.lastIndexOf(YarnBerryImpactGraphCreator.WORKSPACE));
        const version: string | undefined = entry.children.Version;
        return version && version !== YarnBerryImpactGraphCreator.UNVERSIONED_WORKSPACE ? name + ':' + version : name;
    }
}
