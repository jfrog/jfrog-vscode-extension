import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';

/**
 * @see UpdateDependencyManager
 */
export abstract class AbstractUpdateDependency {
    constructor(private _pkgType: string) {}

    public isMatched(dependenciesTreeNode: DependenciesTreeNode): boolean {
        return dependenciesTreeNode.generalInfo.pkgType === this._pkgType;
    }

    /**
     * Update the dependency version in the project descriptor (i.e pom.xml) file after right click on the components tree and a left click on "Update dependency to fixed version".
     * @param dependenciesTreeNode - The dependencies tree node that the user right-clicked on
     */
    public abstract updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void;
}
