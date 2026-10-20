import { IImpactGraph } from 'jfrog-ide-webview';
import { LogManager } from '../../log/logManager';

export interface YarnDependency {
    name: string;
    version: string;
}

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

    getUpgradeCommand(dependencyName: string, version: string, workspaceFolder: string): string;
}
