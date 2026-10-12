import { IImpactGraph } from 'jfrog-ide-webview';
import { LogManager } from '../../log/logManager';
import { YarnImpactGraphCreator } from '../../treeDataProviders/utils/yarnImpactGraph';
import { ScanUtils } from '../scanUtils';
import { YarnDependency, YarnStrategy } from './yarnStrategy';

export class YarnClassicStrategy implements YarnStrategy {
    /** @override */
    public listDependencies(workspaceFolder: string): YarnDependency[] {
        const results: any = JSON.parse(ScanUtils.executeCmd('yarn list --json --no-progress', workspaceFolder).toString());
        const dependencies: YarnDependency[] = [];
        this.collectDependencies(results?.data?.trees, dependencies);
        return dependencies;
    }

    /** @override */
    public createImpactGraph(
        dependencyName: string,
        dependencyVersion: string,
        projectName: string,
        workspaceFolder: string,
        logManager: LogManager
    ): IImpactGraph {
        return new YarnImpactGraphCreator(dependencyName, dependencyVersion, projectName, workspaceFolder, logManager).create();
    }

    /** @override */
    public getUpgradeCommand(dependencyName: string, version: string): string {
        return 'yarn upgrade ' + dependencyName + '@' + version;
    }

    /**
     * Parse all yarn list's dependencies into a flat list.
     * @param children - Child dependencies in Yarn list form
     * @param dependencies - The list to populate
     */
    private collectDependencies(children: any[] | undefined, dependencies: YarnDependency[]): void {
        if (!children) {
            return;
        }
        for (let node of children) {
            // Shadow dependencies does not always contain exact version, and therefore we should skip them.
            if (node.shadow) {
                continue;
            }
            const lastIndexOfAt: number = node.name.lastIndexOf('@');
            dependencies.push({ name: node.name.substring(0, lastIndexOfAt), version: node.name.substring(lastIndexOfAt + 1) });
            if (this.hasRealChildren(node.children)) {
                this.collectDependencies(node.children, dependencies);
            }
        }
    }

    /**
     * Return true if the child dependencies contain any non shadowed dependency.
     * @param childDependencies - Child dependencies at 'yarn list' results
     */
    private hasRealChildren(childDependencies: any[]): boolean {
        if (!childDependencies) {
            return false;
        }
        return childDependencies.some(child => !child.shadow);
    }
}
