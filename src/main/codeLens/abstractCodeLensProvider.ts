import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';

/**
 * @see CodeLensManager
 */
export abstract class AbstractCodeLensProvider implements vscode.CodeLensProvider, ExtensionComponent {
    onDidChangeCodeLenses?: vscode.Event<void> | undefined;

    constructor(private _documentSelector: vscode.DocumentSelector) {}

    /**
     * Get the position of the dependencies in the project descriptor file.
     * For example in package.json - The position of "dependencies:{"
     * @param document - Project descriptor file
     */
    protected abstract getDependenciesPos(document: vscode.TextDocument): vscode.Position[];

    /**
     * Add "Start xray scan" button abode the dependencies section of the project descriptor file.
     * @param document - Project descriptor file
     */
    provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
        let dependenciesPos: vscode.Position[] = this.getDependenciesPos(document);
        let range: vscode.Range = new vscode.Range(dependenciesPos[0], dependenciesPos[1]);
        return [
            new vscode.CodeLens(range, {
                command: 'jfrog.xray.refresh',
                title: 'Start xray scan'
            } as vscode.Command)
        ];
    }

    public activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(this._documentSelector, this));
    }
}
