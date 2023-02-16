import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

export class NpmDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Npm);
    }

    /** @override */
    public isMatched(dependency: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependency);
    }

    /** @override */
    public update(dependency: DependencyIssuesTreeNode, version: string): void {
        const workspace: string = dependency.getSourcePath();
        ScanUtils.executeCmd('npm install ' + dependency.name + '@' + version, workspace);
    }
}
