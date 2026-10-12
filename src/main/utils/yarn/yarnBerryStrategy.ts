import { IImpactGraph } from 'jfrog-ide-webview';
import { LogManager } from '../../log/logManager';
import { YarnBerryImpactGraphCreator } from '../../treeDataProviders/utils/yarnBerryImpactGraph';
import { ScanUtils } from '../scanUtils';
import { parseBerryLocator } from './yarnBerryLocator';
import { YarnDependency, YarnStrategy } from './yarnStrategy';

export class YarnBerryStrategy implements YarnStrategy {
    /** @override */
    public listDependencies(workspaceFolder: string): YarnDependency[] {
        return YarnBerryStrategy.parseDependencies(ScanUtils.executeCmd('yarn info --all --recursive --json', workspaceFolder).toString());
    }

    /** @override */
    public createImpactGraph(
        dependencyName: string,
        dependencyVersion: string,
        projectName: string,
        workspaceFolder: string,
        logManager: LogManager
    ): IImpactGraph {
        return new YarnBerryImpactGraphCreator(dependencyName, dependencyVersion, projectName, workspaceFolder, logManager).create();
    }

    /** @override */
    public getUpgradeCommand(dependencyName: string, version: string): string {
        return 'yarn up ' + dependencyName + '@' + version;
    }

    /**
     * Parse the output of 'yarn info --all --recursive --json', which is one JSON object per line.
     * Only "npm:" entries are returned. Workspaces and patched copies of a package are skipped.
     * @param output - The command output
     */
    public static parseDependencies(output: string): YarnDependency[] {
        const dependencies: YarnDependency[] = [];
        for (const line of output.split('\n')) {
            if (!line.trim().startsWith('{')) {
                continue;
            }
            const dependency: YarnDependency | undefined = YarnBerryStrategy.parseEntry(JSON.parse(line));
            if (dependency) {
                dependencies.push(dependency);
            }
        }
        return dependencies;
    }

    private static parseEntry(entry: any): YarnDependency | undefined {
        if (typeof entry?.value !== 'string' || entry.value.includes('@patch:')) {
            return undefined;
        }
        return parseBerryLocator(entry.value);
    }
}
