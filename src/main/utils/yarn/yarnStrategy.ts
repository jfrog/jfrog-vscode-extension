import { IImpactGraph } from 'jfrog-ide-webview';
import { LogManager } from '../../log/logManager';

export interface YarnDependency {
    name: string;
    version: string;
}

export const YARN_BERRY_INFO_COMMAND: string = 'yarn info --all --recursive --json';

export interface YarnStrategy {
    /**
     * @param workspaceFolder - The folder containing the yarn.lock
     * @returns All resolved dependencies of the project
     */
    listDependencies(workspaceFolder: string): YarnDependency[];

    createImpactGraph(
        dependencyName: string,
        dependencyVersion: string,
        projectName: string,
        workspaceFolder: string,
        logManager: LogManager
    ): IImpactGraph;

    getUpgradeCommand(dependencyName: string, version: string): string;
}
