import { IImpactGraph } from 'jfrog-ide-webview';
import { ScanUtils } from '../scanUtils';
import { YarnBerryImpactGraphCreator, YarnBerryInfoEntry } from './yarnBerryImpactGraph';
import { parseBerryLocator } from './yarnBerryLocator';
import { YARN_BERRY_INFO_COMMAND, YarnDependency, YarnStrategy } from './yarnStrategy';

export class YarnBerryStrategy implements YarnStrategy {
    private _infoEntries?: YarnBerryInfoEntry[];

    /** @override */
    public listDependencies(workspaceFolder: string): YarnDependency[] {
        return YarnBerryStrategy.toDependencies(this.getInfoEntries(workspaceFolder));
    }

    /** @override */
    public createImpactGraph(dependencyName: string, dependencyVersion: string, projectName: string, workspaceFolder: string): IImpactGraph {
        return new YarnBerryImpactGraphCreator(dependencyName, dependencyVersion, projectName, this.getInfoEntries(workspaceFolder)).create();
    }

    /** @override */
    public getUpgradeCommand(dependencyName: string, version: string): string {
        return 'yarn up ' + dependencyName + '@' + version;
    }

    public static parseDependencies(output: string): YarnDependency[] {
        return YarnBerryStrategy.toDependencies(YarnBerryStrategy.parseInfoOutput(output));
    }

    public static parseInfoOutput(output: string): YarnBerryInfoEntry[] {
        return output
            .split('\n')
            .filter((line: string) => line.trim().startsWith('{'))
            .map((line: string) => JSON.parse(line));
    }

    private static toDependencies(entries: YarnBerryInfoEntry[]): YarnDependency[] {
        const dependencies: Map<string, YarnDependency> = new Map();
        for (const entry of entries) {
            const dependency: YarnDependency | undefined = typeof entry?.value === 'string' ? parseBerryLocator(entry.value) : undefined;
            if (dependency) {
                dependencies.set(dependency.name + ':' + dependency.version, dependency);
            }
        }
        return [...dependencies.values()];
    }

    // Cached since the impact graph is created once per vulnerable component
    private getInfoEntries(workspaceFolder: string): YarnBerryInfoEntry[] {
        if (!this._infoEntries) {
            this._infoEntries = YarnBerryStrategy.parseInfoOutput(ScanUtils.executeCmd(YARN_BERRY_INFO_COMMAND, workspaceFolder).toString());
        }
        return this._infoEntries;
    }
}
