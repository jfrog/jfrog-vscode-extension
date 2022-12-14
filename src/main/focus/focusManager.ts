import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { AbstractFocus, FocusType } from './abstractFocus';
import { GoFocus } from './goFocus';
import { MavenFocus } from './mavenFocus';
import { NpmFocus } from './npmFocus';
import { PypiFocus } from './pypiFocus';
import { YarnFocus } from './yarnFocus';
// import { SourceCodeCveTreeNode } from '../treeDataProviders/sourceCodeTree/sourceCodeCveNode';
import * as vscode from 'vscode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';

/**
 * Show the dependency in the project descriptor (i.e package.json) or CVE in the source code file after left click on the eye icon".
 */
export class FocusManager implements ExtensionComponent {
    private _focuses: AbstractFocus[] = [];

    constructor() {
        this._focuses.push(new NpmFocus(), new YarnFocus(), new PypiFocus(), new GoFocus(), new MavenFocus());
    }

    public activate() {
        return this;
    }

    public focusOnDependency(dependenciesTreeNode: DependenciesTreeNode, focusType: FocusType) {
        this._focuses
            .filter(focus => focus.isMatched(dependenciesTreeNode))
            .forEach(focus => focus.focusOnDependency(dependenciesTreeNode, focusType));
    }

    public async openFile(fileNode: FileTreeNode) {
        if (fileNode === undefined || fileNode.fullPath === '') {
            return;
        }
        let openPath: vscode.Uri = vscode.Uri.file(fileNode.fullPath);
        if (!openPath) {
            return;
        }
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(openPath);
        let textEditor: vscode.TextEditor | undefined = await vscode.window.showTextDocument(textDocument);
        if (!textEditor) {
            return;
        }
    }

    // public async focusOnCve(node?: SourceCodeCveTreeNode, index?: number) {
    //     if (node === undefined || node.getFile() === '') {
    //         return;
    //     }
    //     let openPath: vscode.Uri = vscode.Uri.file(node.getFile());
    //     if (!openPath) {
    //         return;
    //     }
    //     let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(openPath);
    //     let textEditor: vscode.TextEditor | undefined = await vscode.window.showTextDocument(textDocument);
    //     if (!textEditor) {
    //         return;
    //     }
    //     const startPos: vscode.Position = new vscode.Position(
    //         node.getNodeDetails()[index ?? 0].startLine - 1,
    //         node.getNodeDetails()[index ?? 0].startColumn
    //     );
    //     const endPosition: vscode.Position = new vscode.Position(
    //         node.getNodeDetails()[index ?? 0].endLine - 1,
    //         node.getNodeDetails()[index ?? 0].endColumn
    //     );

    //     textEditor.selection = new vscode.Selection(startPos, endPosition);
    //     textEditor.revealRange(new vscode.Range(startPos, endPosition), vscode.TextEditorRevealType.InCenter);
    // }
}
