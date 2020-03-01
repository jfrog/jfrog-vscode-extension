import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { PypiUtils } from '../utils/pypiUtils';
import { AbstractHoverProvider } from './abstractHoverProvider';

export class PypiHover extends AbstractHoverProvider {
    constructor(treesManager: TreesManager) {
        super(PypiUtils.DOCUMENT_SELECTOR, treesManager);
    }

    /** @override */
    public getNodeByLocation(document: vscode.TextDocument, cursorPosition: vscode.Position): DependenciesTreeNode | undefined {
        let dependenciesTree: DependenciesTreeNode | undefined = this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode('pypi');
        if (!dependenciesTree) {
            return;
        }
        let requirementsContent: string = document.getText().toLowerCase();
        for (let child of dependenciesTree.children) {
            if (this.isNodeInRange(child, document, requirementsContent, cursorPosition)) {
                return child;
            }
            for (let grandchild of child.children) {
                if (this.isNodeInRange(grandchild, document, requirementsContent, cursorPosition)) {
                    return grandchild;
                }
            }
        }
        return undefined;
    }

    /**
     * Return true iff the user points on the dependency in the requirements.txt file.
     * @param node - The dependencies tree node
     * @param document - requirements.txt
     * @param requirementsContent - The content of requirements.txt - For optimization
     * @param cursorPosition - The position of the mouse on the screen
     */
    private isNodeInRange(
        node: DependenciesTreeNode,
        document: vscode.TextDocument,
        requirementsContent: string,
        cursorPosition: vscode.Position
    ): boolean {
        let pos: vscode.Position[] = PypiUtils.getDependencyPos(document, requirementsContent, node);
        if (pos.length > 0) {
            let range: vscode.Range = new vscode.Range(pos[0], pos[1]);
            if (range.contains(cursorPosition)) {
                return true;
            }
        }
        return false;
    }
}
