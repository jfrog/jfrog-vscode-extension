import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractCodeActionProvider } from './abstractCodeActionProvider';
import { NpmCodeActionProvider } from './npmCodeActionProvider';
import { PypiCodeActionProvider } from './pypiCodeActionProvider';
import { GoCodeActionProvider } from './goCodeActionProvider';
import { MavenCodeActionProvider } from './mavenCodeActionProvider';

/**
 * In case of project descriptor (i.e package.json) open, perform:
 * 1. Populate the 'Problems' view with top severities of the project dependencies.
 * 2. Provide red, yellow, green or white line under a dependency in the project descriptor.
 */
export class DiagnosticsManager implements ExtensionComponent {
    private _codeActionProviders: AbstractCodeActionProvider[] = [];

    constructor(treesManager: TreesManager) {
        let diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection();
        this._codeActionProviders.push(
            new NpmCodeActionProvider(diagnosticCollection, treesManager),
            new PypiCodeActionProvider(diagnosticCollection, treesManager),
            new GoCodeActionProvider(diagnosticCollection, treesManager),
            new MavenCodeActionProvider(diagnosticCollection, treesManager)
        );
    }

    public activate(context: vscode.ExtensionContext) {
        this._codeActionProviders.forEach(codeActionProvider => codeActionProvider.activate(context));
    }
}
