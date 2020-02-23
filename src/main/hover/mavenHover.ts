import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractHoverProvider } from './abstractHoverProvider';
import { DOCUMENT_SELECTOR, getDependencyPos } from '../utils/mavenUtils';

export class MavenHover extends AbstractHoverProvider {
    constructor(treesManager: TreesManager) {
        super(DOCUMENT_SELECTOR, treesManager);
    }

    /** @override */
    public getNodeByLocation(document: vscode.TextDocument, cursorPosition: vscode.Position): DependenciesTreeNode | undefined {
        let dependenciesTree: DependenciesTreeNode | undefined = this._treesManager.dependenciesTreeDataProvider.getDependenciesTreeNode(
            'maven',
            path.dirname(document.uri.fsPath)
        );
        if (!dependenciesTree) {
            return;
        }
        for (const child of dependenciesTree.children) {
            let [startPos, endPos] = getDependencyPos(document, child);
            let range: vscode.Range = new vscode.Range(startPos, endPos);
            if (range.contains(cursorPosition)) {
                return child;
            }
        }
        return;
    }
}
