import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractHoverProvider } from './abstractHoverProvider';
import { PypiUtils } from '../utils/pypiUtils';

export class PypiHover extends AbstractHoverProvider {
    constructor(treesManager: TreesManager) {
        super(PypiUtils.DOCUMENT_SELECTOR, treesManager);
    }

    public getNodeByLocation(document: vscode.TextDocument, cursorPosition: vscode.Position): DependenciesTreeNode | undefined {
        let dependenciesTree: DependenciesTreeNode | undefined = this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(
            'pypi',
            path.dirname(document.uri.fsPath)
        );
        if (!dependenciesTree) {
            return;
        }
        for (const child of dependenciesTree.children) {
            let pos: vscode.Position[] = PypiUtils.getDependencyPos(document, child);
            if (pos.length > 0) {
                let range: vscode.Range = new vscode.Range(pos[0], pos[1]);
                if (range.contains(cursorPosition)) {
                    return child;
                }
            }
        }
        return undefined;
    }
}
