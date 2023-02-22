import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';
import { NugetUtils } from '../utils/nugetUtils';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

export class NugetDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Nuget);
    }

    /** @override */
    public isMatched(dependency: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependency);
    }

    /** @override */
    public update(dependency: DependencyIssuesTreeNode, version: string): void {
        const workspace: string = dependency.getDependencyProjectPath();
        let descriptorFile: string = dependency.getDependencyFilePath();
        if (descriptorFile.endsWith(NugetUtils.PROJECT_SUFFIX)) {
            ScanUtils.executeCmd('dotnet add package ' + dependency.name + ' --version ' + version, workspace);
        } else {
            ScanUtils.executeCmd('nuget update ' + descriptorFile + ' -Id ' + dependency.name + ' -Version ' + version, workspace);
        }
    }
}
