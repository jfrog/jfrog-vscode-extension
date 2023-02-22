import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

export class GoDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Go);
    }

    /** @override */
    public isMatched(dependency: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependency);
    }

    /** @override */
    public update(dependency: DependencyIssuesTreeNode, version: string): void {
        const workspace: string = dependency.getDependencyProjectPath();
        ScanUtils.executeCmd('go get ' + dependency.name + '@v' + version, workspace);
    }
}
