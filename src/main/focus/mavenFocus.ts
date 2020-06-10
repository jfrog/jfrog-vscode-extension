import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { AbstractFocus } from './abstractFocus';
import { MavenUtils } from '../utils/mavenUtils';

export class MavenFocus extends AbstractFocus {
    constructor() {
        super(MavenUtils.PKG_TYPE);
    }

    /** @override */
    public async focusOnDependency(dependenciesTreeNode: DependenciesTreeNode) {
        const textDocument: vscode.TextDocument | undefined = await MavenUtils.openPomXml(dependenciesTreeNode);
        if (!textDocument) {
            return;
        }
        const textEditor: vscode.TextEditor = await vscode.window.showTextDocument(textDocument);
        if (dependenciesTreeNode.isDependenciesTreeRoot()) {
            return;
        }
        let [startPos, endPosition] = MavenUtils.getDependencyPos(textEditor.document, dependenciesTreeNode);
        if (!startPos || !endPosition) {
            return;
        }
        textEditor.selection = new vscode.Selection(startPos, endPosition);
        textEditor.revealRange(new vscode.Range(startPos, endPosition), vscode.TextEditorRevealType.InCenter);
    }
}
