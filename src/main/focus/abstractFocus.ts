import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';

/**
 * @see FocusManager
 */
export abstract class AbstractFocus {
    public abstract focusOnDependency(dependenciesTreeNode: DependenciesTreeNode): void;
}
