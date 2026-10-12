import { IImpactGraph, IImpactGraphNode } from 'jfrog-ide-webview';
import { LogManager } from '../../log/logManager';
import { ScanUtils } from '../../utils/scanUtils';
import { parseBerryLocator } from '../../utils/yarn/yarnBerryLocator';
import { YarnDependency } from '../../utils/yarn/yarnStrategy';
import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';

/**
 * A node in the "yarn why --recursive --json" output. The top level item is the workspace and has no locator.
 */
export interface YarnBerryWhyItem {
    value?: string | { locator: string; descriptor: string };
    children: { [key: string]: YarnBerryWhyItem };
}

/**
 * Creates an impact graph based on "yarn why --recursive --json" output of Yarn Berry (v2+).
 */
export class YarnBerryImpactGraphCreator {
    private _pathsCount: number = 0;

    constructor(
        private _dependencyName: string,
        private _dependencyVersion: string,
        private _projectName: string,
        private _workspaceFolder: string,
        private _logManager: LogManager
    ) {}

    public create(): IImpactGraph {
        this._pathsCount = 0;
        const children: IImpactGraphNode[] = [];
        for (const workspace of this.runYarnWhy()) {
            children.push(...this.collectPaths(workspace.children));
        }
        if (children.length === 0) {
            return {} as IImpactGraph;
        }
        return {
            root: { name: this._projectName, children },
            pathsLimit: RootNode.createImpactPathLimit(this._pathsCount)
        } as IImpactGraph;
    }

    /**
     * Keeps only the branches that lead to the requested dependency version.
     * @param children - The children of a node in the "yarn why" tree
     */
    private collectPaths(children: { [key: string]: YarnBerryWhyItem } | undefined): IImpactGraphNode[] {
        const nodes: IImpactGraphNode[] = [];
        for (const child of Object.values(children ?? {})) {
            if (this._pathsCount >= RootNode.IMPACT_PATHS_LIMIT) {
                break;
            }
            const dependency: YarnDependency | undefined = this.getDependency(child);
            if (!dependency) {
                continue;
            }
            const name: string = dependency.name + ':' + dependency.version;
            if (dependency.name === this._dependencyName && dependency.version === this._dependencyVersion) {
                this._pathsCount++;
                nodes.push({ name });
                continue;
            }
            const subPaths: IImpactGraphNode[] = this.collectPaths(child.children);
            if (subPaths.length > 0) {
                nodes.push({ name, children: subPaths });
            }
        }
        return nodes;
    }

    private getDependency(item: YarnBerryWhyItem): YarnDependency | undefined {
        const locator: string | undefined = typeof item.value === 'object' ? item.value?.locator : undefined;
        return locator ? parseBerryLocator(locator) : undefined;
    }

    protected runYarnWhy(): YarnBerryWhyItem[] {
        const cmd: string = 'yarn why --recursive --json ' + this._dependencyName;
        this._logManager.debug('Running ' + cmd + ' at ' + this._workspaceFolder);
        const output: string = ScanUtils.executeCmd(cmd, this._workspaceFolder).toString();
        return output
            .split('\n')
            .filter(line => line.trim().startsWith('{'))
            .map((line: string) => JSON.parse(line));
    }
}
