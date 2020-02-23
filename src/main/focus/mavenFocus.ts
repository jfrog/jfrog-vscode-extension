import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { AbstractFocus } from './abstractFocus';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/mavenTreeNode';
import { PKG_TYPE, getDependencyPos } from '../utils/mavenUtils';

export class MavenFocus extends AbstractFocus {
    constructor() {
        super(PKG_TYPE);
    }

    /** @override */
    public async focusOnDependency(dependenciesTreeNode: DependenciesTreeNode) {
        let textEditor: vscode.TextEditor | undefined = await this.openPomXml(dependenciesTreeNode);
        if (!textEditor) {
            return;
        }
        if (dependenciesTreeNode.isDependenciesTreeRoot()) {
            return;
        }
        let [startPos, endPosition] = getDependencyPos(textEditor.document, dependenciesTreeNode);
        if (!startPos || !endPosition) {
            return;
        }
        textEditor.selection = new vscode.Selection(startPos, endPosition);
        textEditor.revealRange(new vscode.Range(startPos, endPosition), vscode.TextEditorRevealType.InCenter);
    }

    private async openPomXml(dependenciesTreeNode: DependenciesTreeNode): Promise<vscode.TextEditor | undefined> {
        // Search for the nearest pom.xml(MavenTreeNode) witch locate the fs path
        while (dependenciesTreeNode.parent && dependenciesTreeNode instanceof MavenTreeNode === false) {
            dependenciesTreeNode = dependenciesTreeNode.parent;
        }
        let fsPath: string = (<MavenTreeNode>dependenciesTreeNode).workspaceFolder;
        let openPath: vscode.Uri = vscode.Uri.file(path.join(fsPath, 'pom.xml'));
        if (!openPath) {
            return;
        }
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(openPath);
        return await vscode.window.showTextDocument(textDocument);
    }
}
