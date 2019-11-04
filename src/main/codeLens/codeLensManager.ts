import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';
import { NpmCodeLensProvider } from './npmCodeLensProvider';
import { GoCodeLensProvider } from './goCodeLensProvider';

/**
 * Provide the 'Start Xray scan' button in the project descriptor file (i.e package.json).
 */
export class CodeLensManager implements ExtensionComponent {
    private _codeLensProviders: AbstractCodeLensProvider[] = [];

    constructor() {
        this._codeLensProviders.push(new NpmCodeLensProvider(), new GoCodeLensProvider());
    }

    public activate(context: vscode.ExtensionContext) {
        this._codeLensProviders.forEach(codeActionProvider => codeActionProvider.activate(context));
    }
}
