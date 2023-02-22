import { ExtensionComponent } from '../extensionComponent';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';
import { GoDependencyUpdate } from './goDependencyUpdate';
import { MavenDependencyUpdate } from './mavenDependencyUpdate';
import { NpmDependencyUpdate } from './npmDependencyUpdate';
import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { LogManager } from '../log/logManager';
import { YarnDependencyUpdate } from './yarnDependencyUpdate';
import { NugetDependencyUpdate } from './nugetDependencyUpdate';
import { PythonDependencyUpdate } from './pythonDependencyUpdate';

/**
 * Update the dependency version in the project descriptor (e.g. pom.xml) file after right click on the components tree and a left click on "Update dependency to fixed version".
 */
export class DependencyUpdateManager implements ExtensionComponent {
    private _dependencyUpdaters: AbstractDependencyUpdate[] = [];

    constructor(private _logManager: LogManager) {
        this._dependencyUpdaters.push(
            new MavenDependencyUpdate(),
            new NpmDependencyUpdate(),
            new YarnDependencyUpdate(),
            new GoDependencyUpdate(),
            new NugetDependencyUpdate(),
            new PythonDependencyUpdate()
        );
    }

    public activate() {
        return this;
    }

    public async updateToFixedVersion(dependency: DependencyIssuesTreeNode, version: string): Promise<boolean> {
        const manager: AbstractDependencyUpdate | undefined = this.getUpdateManager(dependency);
        try {
            if (manager) {
                manager.update(dependency, version);
                return true;
            }
        } catch (error) {
            this._logManager.logMessage((<any>error).message, 'ERR', true);
        }
        return false;
    }

    public getUpdateManager(dependency: DependencyIssuesTreeNode): AbstractDependencyUpdate | undefined {
        return this._dependencyUpdaters.find(manager => manager.isMatched(dependency));
    }
}
