import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

export class PnpmDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Pnpm);
    }

    /** @override */
    public isMatched(dependency: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependency);
    }

    /** @override */
    public update(dependency: DependencyIssuesTreeNode, version: string): void {
        const workspace: string = dependency.getDependencyProjectPath();
        ScanUtils.executeCmd('pnpm upgrade ' + dependency.name + '@' + version, workspace);
    }
}
