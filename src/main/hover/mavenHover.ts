import * as path from 'path';
import * as vscode from 'vscode';
import { MavenUtils } from '../utils/mavenUtils';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractHoverProvider } from './abstractHoverProvider';

export class MavenHover extends AbstractHoverProvider {
    constructor(treesManager: TreesManager) {
        super(MavenUtils.DOCUMENT_SELECTOR, treesManager);
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
            let [startPos, endPos] = MavenUtils.getDependencyPos(document, child);
            let range: vscode.Range = new vscode.Range(startPos, endPos);
            if (range.contains(cursorPosition)) {
                return child;
            }
        }
        return;
    }
}
