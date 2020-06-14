import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';

/**
 * @see ExclusionManger
 */
export abstract class AbstractExclusion {
    constructor(private _pkgType: string) {}

    public isMatched(dependenciesTreeNode: DependenciesTreeNode): boolean {
        return dependenciesTreeNode.generalInfo.pkgType === this._pkgType;
    }

    /**
     * Exclude the dependency in the project descriptor (i.e pom.xml) file after right click on the components tree and a left click on "Exclude dependency".
     * @param dependenciesTreeNode - The dependencies tree node that the user right-clicked on
     */
    public abstract excludeDependency(dependenciesTreeNode: DependenciesTreeNode): void;
}
