import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GoUtils } from '../utils/goUtils';
import { AbstractFocus } from './abstractFocus';

export class GoFocus extends AbstractFocus {
    constructor() {
        super(GoUtils.PKG_TYPE);
    }

    /** @override */
    public async focusOnDependency(dependenciesTreeNode: DependenciesTreeNode) {
        while (dependenciesTreeNode.parent && dependenciesTreeNode.parent.parent && dependenciesTreeNode.parent.parent.parent) {
            dependenciesTreeNode = dependenciesTreeNode.parent;
        }
        let textEditor: vscode.TextEditor | undefined = await this.openGoMod(dependenciesTreeNode);
        if (!textEditor) {
            return;
        }
        if (dependenciesTreeNode.isDependenciesTreeRoot()) {
            return;
        }
        let pos: vscode.Position[] = GoUtils.getDependencyPos(textEditor.document, dependenciesTreeNode);
        if (!pos) {
            return;
        }
        textEditor.selection = new vscode.Selection(pos[0], pos[1]);
        textEditor.revealRange(new vscode.Range(pos[0], pos[1]), vscode.TextEditorRevealType.InCenter);
    }

    private async openGoMod(dependenciesTreeNode: DependenciesTreeNode): Promise<vscode.TextEditor | undefined> {
        let parent: DependenciesTreeNode | undefined = dependenciesTreeNode.parent;
        if (!parent) {
            return;
        }
        let fsPath: string = dependenciesTreeNode.isDependenciesTreeRoot() ? dependenciesTreeNode.generalInfo.path : parent.generalInfo.path;
        let openPath: vscode.Uri = vscode.Uri.file(path.join(fsPath, 'go.mod'));
        if (!openPath) {
            return;
        }
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(openPath);
        return await vscode.window.showTextDocument(textDocument);
    }
}
