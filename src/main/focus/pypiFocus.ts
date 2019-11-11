import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { AbstractFocus } from './abstractFocus';
import { PypiUtils } from '../utils/pypiUtils';

export class PypiFocus extends AbstractFocus {
    public async focusOnDependency(dependenciesTreeNode: DependenciesTreeNode) {
        while (dependenciesTreeNode.parent && dependenciesTreeNode.parent.parent && dependenciesTreeNode.parent.parent.parent) {
            dependenciesTreeNode = dependenciesTreeNode.parent;
        }
        if (dependenciesTreeNode.isDependenciesTreeRoot()) {
            return;
        }

        let parent: DependenciesTreeNode | undefined = dependenciesTreeNode.parent;
        if (!parent) {
            return;
        }
        let fsPath: string = dependenciesTreeNode.isDependenciesTreeRoot() ? dependenciesTreeNode.generalInfo.path : parent.generalInfo.path;
        let requirementsFiles: vscode.Uri[] = await PypiUtils.getRequirementsFiles(fsPath);
        for (let requirementsFile of requirementsFiles) {
            let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(requirementsFile);
            let pos: vscode.Position[] = PypiUtils.getDependencyPos(textDocument, dependenciesTreeNode);
            if (pos.length > 0) {
                let textEditor: vscode.TextEditor = await vscode.window.showTextDocument(textDocument);
                textEditor.selection = new vscode.Selection(pos[0], pos[1]);
                textEditor.revealRange(new vscode.Range(pos[0], pos[1]), vscode.TextEditorRevealType.InCenter);
                return;
            }
        }
    }
}
