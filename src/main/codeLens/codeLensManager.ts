import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';
import { NpmCodeLensProvider } from './npmCodeLensProvider';
import { PypiCodeLensProvider } from './pypiCodeLensProvider';

/**
 * Provide the 'Start Xray scan' button in the project descriptor file (i.e package.json).
 */
export class CodeLensManager implements ExtensionComponent {
    private _codeLensProviders: AbstractCodeLensProvider[] = [];

    constructor() {
        this._codeLensProviders.push(new NpmCodeLensProvider(), new PypiCodeLensProvider());
    }

    public activate(context: vscode.ExtensionContext) {
        this._codeLensProviders.forEach(codeActionProvider => codeActionProvider.activate(context));
    }
}
