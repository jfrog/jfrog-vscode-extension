import { IImpactGraph, IImpactGraphNode } from 'jfrog-ide-webview';
import { RootNode } from '../../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { devirtualizeBerryLocator, getBerryLocatorName, parseBerryLocator } from './yarnBerryLocator';
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
        const ids: Map<string, string> = new Map(
            this._infoEntries.map((entry: YarnBerryInfoEntry): [string, string] => [devirtualizeBerryLocator(entry.value), this.getNodeId(entry)])
        );
        const edges: Map<string, string[]> = new Map();
        const rootDependencies: Set<string> = new Set();
        const workspaces: Set<string> = new Set();
        for (const entry of this._infoEntries) {
            const locator: string = devirtualizeBerryLocator(entry.value);
            const dependencies: string[] = (entry.children.Dependencies ?? [])
                .map(dependency => devirtualizeBerryLocator(dependency.locator))
                .filter(dependency => !dependency.includes(YarnBerryImpactGraphCreator.WORKSPACE))
                .map(dependency => ids.get(dependency))
                .filter((dependencyId): dependencyId is string => dependencyId !== undefined);
            if (locator.endsWith(YarnBerryImpactGraphCreator.ROOT_WORKSPACE)) {
                dependencies.forEach(dependency => rootDependencies.add(dependency));
                continue;
            }
            const id: string = ids.get(locator) as string;
            edges.set(id, [...new Set([...(edges.get(id) ?? []), ...dependencies])]);
            if (locator.includes(YarnBerryImpactGraphCreator.WORKSPACE)) {
                workspaces.add(id);
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

    private getNodeId(entry: YarnBerryInfoEntry): string {
        const locator: string = devirtualizeBerryLocator(entry.value);
        const version: string | undefined = entry.children.Version;
        if (locator.includes(YarnBerryImpactGraphCreator.WORKSPACE)) {
            const name: string = locator.substring(0, locator.lastIndexOf(YarnBerryImpactGraphCreator.WORKSPACE));
            return name + ':' + (version && version !== YarnBerryImpactGraphCreator.UNVERSIONED_WORKSPACE ? version : '0.0.0');
        }
        const dependency: YarnDependency | undefined = parseBerryLocator(locator);
        return dependency ? dependency.name + ':' + dependency.version : getBerryLocatorName(locator) + ':' + (version ?? '0.0.0');
    }
}
