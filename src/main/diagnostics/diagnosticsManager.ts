import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractFileActionProvider } from './abstractFileActionProvider';
import { DescriptorActionProvider } from './descriptorActionProvider';

/**
 * In case of project descriptor (i.e package.json) open, perform:
 * 1. Populate the 'Problems' view with top severities of the project dependencies.
 * 2. Provide vulnerabilities icons on the left gutter white line under a dependency in the project descriptor.
 */
export class DiagnosticsManager implements ExtensionComponent {
    private _codeActionProviders: AbstractFileActionProvider[] = [];

    constructor(treesManager: TreesManager) {
        let diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection();

        this._codeActionProviders.push(new DescriptorActionProvider(diagnosticCollection, treesManager));
    }

    public activate(context: vscode.ExtensionContext) {
        this._codeActionProviders.forEach(codeActionProvider => codeActionProvider.activate(context));
    }
}
