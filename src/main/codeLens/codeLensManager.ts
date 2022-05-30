import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { AbstractCodeLensProvider } from './abstractCodeLensProvider';
import { GoCodeLensProvider } from './goCodeLensProvider';
import { MavenCodeLensProvider } from './mavenCodeLensProvider';
import { NpmCodeLensProvider } from './npmCodeLensProvider';
import { PypiCodeLensProvider } from './pypiCodeLensProvider';
import { YarnCodeLensProvider } from './yarnCodeLensProvider';

/**
 * Provide the 'Start Xray scan' button in the project descriptor file (i.e package.json).
 */
export class CodeLensManager implements ExtensionComponent {
    private _codeLensProviders: AbstractCodeLensProvider[] = [];

    constructor() {
        this._codeLensProviders.push(
            new NpmCodeLensProvider(),
            new YarnCodeLensProvider(),
            new PypiCodeLensProvider(),
            new GoCodeLensProvider(),
            new MavenCodeLensProvider()
        );
    }

    public activate(context: vscode.ExtensionContext) {
        this._codeLensProviders.forEach(codeActionProvider => codeActionProvider.activate(context));
    }
}
