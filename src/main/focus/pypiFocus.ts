import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { PypiUtils } from '../utils/pypiUtils';
import { AbstractFocus } from './abstractFocus';

export class PypiFocus extends AbstractFocus {
    constructor() {
        super(PypiUtils.PKG_TYPE);
    }

    /** @override */
    public async focusOnDependency(dependenciesTreeNode: DependenciesTreeNode) {
        if (dependenciesTreeNode.isDependenciesTreeRoot()) {
            return;
        }
        /**
         *       |-> Pypi project 1 -> dependenciesTreeNode -> child
         * Root -|-> Pypi project 2
         *       |-> Pypi project 3
         */
        let child: DependenciesTreeNode | undefined;
        while (dependenciesTreeNode.parent && dependenciesTreeNode.parent.parent && dependenciesTreeNode.parent.parent.parent) {
            child = dependenciesTreeNode;
            dependenciesTreeNode = dependenciesTreeNode.parent;
        }

        let parent: DependenciesTreeNode | undefined = dependenciesTreeNode.parent;
        if (!parent) {
            return;
        }
        let fsPath: string = parent.generalInfo.path;
        let requirementsFiles: vscode.Uri[] = await PypiUtils.getRequirementsFiles(fsPath);
        for (let requirementsFile of requirementsFiles) {
            let document: vscode.TextDocument = await vscode.workspace.openTextDocument(requirementsFile);
            let requirementsContent: string = document.getText().toLowerCase();
            let pos: vscode.Position[] = PypiUtils.getDependencyPos(document, requirementsContent, dependenciesTreeNode);
            if (pos.length > 0) {
                this.revealRange(document, pos);
                return;
            }
            // If dependency haven't been found in the the node, search in its children
            if (child) {
                pos = PypiUtils.getDependencyPos(document, requirementsContent, child);
                if (pos.length > 0) {
                    this.revealRange(document, pos);
                    return;
                }
            }
        }
        // Couldn't find the dependency in requirements files. Show setup.py.
        this.tryOpenSetupPy(fsPath);
    }

    /**
     * Open the input file and show the lines as specified in the input position.
     * @param textDocument - requirements.txt or setup.py
     * @param position - The position in the file to show
     */
    private async revealRange(textDocument: vscode.TextDocument, position: vscode.Position[]) {
        let textEditor: vscode.TextEditor = await vscode.window.showTextDocument(textDocument);
        textEditor.selection = new vscode.Selection(position[0], position[1]);
        textEditor.revealRange(new vscode.Range(position[0], position[1]), vscode.TextEditorRevealType.InCenter);
    }

    /**
     * Try to open setup.py
     * @param fsPath Path to the root of the Pypi project
     */
    private async tryOpenSetupPy(fsPath: string) {
        let setupPyPath: string = path.join(fsPath, 'setup.py');
        if (!fs.existsSync(setupPyPath)) {
            return;
        }
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(setupPyPath);
        let pos: vscode.Position[] = PypiUtils.getDependenciesPos(textDocument);
        if (pos.length > 0) {
            this.revealRange(textDocument, pos);
        } else {
            this.revealRange(textDocument, [new vscode.Position(0, 0), new vscode.Position(0, 0)]);
        }
    }
}
