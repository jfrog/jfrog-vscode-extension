import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractHoverProvider } from './abstractHoverProvider';
import { MavenUtils } from '../utils/mavenUtils';

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
            let positionList: vscode.Position[] = MavenUtils.getDependencyPos(document, child);
            for (let i: number = 0; i < positionList.length; i += 2) {
                let range: vscode.Range = new vscode.Range(positionList[i], positionList[i + 1]);
                if (range.contains(cursorPosition)) {
                    return child;
                }
            }
        }
        return;
    }
}
