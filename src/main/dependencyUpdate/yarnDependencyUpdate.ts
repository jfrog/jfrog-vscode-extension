import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

export class YarnDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Yarn);
    }

    /** @override */
    public isMatched(dependenciesTreeNode: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependenciesTreeNode);
    }

    /** @override */
    public update(dependenciesTreeNode: DependencyIssuesTreeNode, version: string): void {
        const workspace: string = dependenciesTreeNode.getSourcePath();
        ScanUtils.executeCmd('yarn upgrade ' + dependenciesTreeNode.name + '@' + version, workspace);
    }
}
