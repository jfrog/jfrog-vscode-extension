import { IImpactGraph } from 'jfrog-ide-webview';
import * as fs from 'fs';
import * as path from 'path';
import { ScanUtils } from '../scanUtils';
import { YarnBerryImpactGraphCreator, YarnBerryInfoEntry } from './yarnBerryImpactGraph';
import { parseBerryLocator } from './yarnBerryLocator';
import { YarnDependency, YarnStrategy } from './yarnStrategy';

const YARN_BERRY_INFO_COMMAND: string = 'yarn info --all --recursive --json';
const DEPENDENCY_SECTIONS: string[] = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

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
    public getUpgradeCommand(dependencyName: string, version: string, workspaceFolder: string): string {
        const alias: string | undefined = YarnBerryStrategy.findAlias(dependencyName, workspaceFolder);
        return alias ? 'yarn up ' + alias + '@npm:' + dependencyName + '@' + version : 'yarn up ' + dependencyName + '@' + version;
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

    /**
     * 'yarn up' matches manifest names, so a package declared under an alias ("alias": "npm:name@range") is upgraded by its alias.
     */
    private static findAlias(dependencyName: string, workspaceFolder: string): string | undefined {
        const packageJson: any = JSON.parse(fs.readFileSync(path.join(workspaceFolder, 'package.json'), 'utf8'));
        let alias: string | undefined;
        for (const section of DEPENDENCY_SECTIONS) {
            for (const [name, range] of Object.entries<any>(packageJson[section] ?? {})) {
                if (name === dependencyName) {
                    return undefined;
                }
                if (!alias && typeof range === 'string' && range.startsWith('npm:' + dependencyName + '@')) {
                    alias = name;
                }
            }
        }
        return alias;
    }

    // Cached since the impact graph is created once per vulnerable component
    private getInfoEntries(workspaceFolder: string): YarnBerryInfoEntry[] {
        if (!this._infoEntries) {
            this._infoEntries = YarnBerryStrategy.parseInfoOutput(ScanUtils.executeCmd(YARN_BERRY_INFO_COMMAND, workspaceFolder).toString());
        }
        return this._infoEntries;
    }
}
