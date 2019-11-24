import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { PypiUtils } from '../utils/pypiUtils';
import { AbstractHoverProvider } from './abstractHoverProvider';

export class PypiHover extends AbstractHoverProvider {
    constructor(treesManager: TreesManager) {
        super(PypiUtils.DOCUMENT_SELECTOR, treesManager);
    }

    public getNodeByLocation(document: vscode.TextDocument, cursorPosition: vscode.Position): DependenciesTreeNode | undefined {
        let dependenciesTree: DependenciesTreeNode | undefined = this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode('pypi');
        if (!dependenciesTree) {
            return;
        }
        let requirementsContent: string = document.getText().toLowerCase();
        for (let child of dependenciesTree.children) {
            let pos: vscode.Position[] = PypiUtils.getDependencyPos(document, requirementsContent, child);
            if (pos.length > 0) {
                let range: vscode.Range = new vscode.Range(pos[0], pos[1]);
                return range.contains(cursorPosition) ? child : undefined;
            }

            for (let grandchild of child.children) {
                pos = PypiUtils.getDependencyPos(document, requirementsContent, grandchild);
                if (pos.length > 0) {
                    let range: vscode.Range = new vscode.Range(pos[0], pos[1]);
                    if (range.contains(cursorPosition)) {
                        return grandchild;
                    }
                }
            }
        }
        return undefined;
    }
}
