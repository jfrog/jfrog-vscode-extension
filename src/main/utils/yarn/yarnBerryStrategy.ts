import { IImpactGraph } from 'jfrog-ide-webview';
import { LogManager } from '../../log/logManager';
import { ScanUtils } from '../scanUtils';
import { YarnBerryImpactGraphCreator } from './yarnBerryImpactGraph';
import { parseBerryLocator } from './yarnBerryLocator';
import { YARN_BERRY_INFO_COMMAND, YarnDependency, YarnStrategy } from './yarnStrategy';

export class YarnBerryStrategy implements YarnStrategy {
    /** @override */
    public listDependencies(workspaceFolder: string): YarnDependency[] {
        return YarnBerryStrategy.parseDependencies(ScanUtils.executeCmd(YARN_BERRY_INFO_COMMAND, workspaceFolder).toString());
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

    public static parseDependencies(output: string): YarnDependency[] {
        const dependencies: Map<string, YarnDependency> = new Map();
        for (const line of output.split('\n')) {
            if (!line.trim().startsWith('{')) {
                continue;
            }
            const value: unknown = JSON.parse(line)?.value;
            const dependency: YarnDependency | undefined = typeof value === 'string' ? parseBerryLocator(value) : undefined;
            if (dependency) {
                dependencies.set(dependency.name + ':' + dependency.version, dependency);
            }
        }
        return [...dependencies.values()];
    }
}
