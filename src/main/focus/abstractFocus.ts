import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';

/**
 * @see FocusManager
 */
export abstract class AbstractFocus {
    constructor(private _pkgType: string) {}

    public isMatched(dependenciesTreeNode: DependenciesTreeNode): boolean {
        return dependenciesTreeNode.generalInfo.pkgType === this._pkgType;
    }

    /**
     * Show the dependency in the project descriptor (i.e package.json) file after right click on the components tree and a left click on "Show in project descriptor".
     * @param dependenciesTreeNode - The dependencies tree node that the user right-clicked on
     */
    public abstract focusOnDependency(dependenciesTreeNode: DependenciesTreeNode): void;
}
