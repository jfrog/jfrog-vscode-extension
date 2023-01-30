import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { PackageType } from '../types/projectType';

/**
 * @see DependencyUpdateManager
 */
export abstract class AbstractDependencyUpdate {
    constructor(private _pkgType: PackageType) {}

    public isMatched(dependenciesTreeNode: DependencyIssuesTreeNode): boolean {
        return dependenciesTreeNode.type === this._pkgType;
    }

    /**
     * Update the dependency version in the project descriptor (i.e pom.xml).
     * @param dependency - The dependencies tree node.
     * @param version - This is the new version to update to
     */
    public abstract update(dependency: DependencyIssuesTreeNode, version: string): void;
}
