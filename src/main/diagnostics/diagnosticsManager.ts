import * as vscode from 'vscode';
import { DependencyUpdateManager } from '../dependencyUpdate/dependencyUpdateManager';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractFileActionProvider } from './abstractFileActionProvider';
import { CodeFileActionProvider } from './codeFileActionProvider';
import { DescriptorActionProvider } from './descriptorActionProvider';

/**
 * In case of project descriptor (i.e package.json) open, perform:
 * 1. Populate the 'Problems' view with top severities of the project dependencies.
 * 2. Provide vulnerabilities icons on the left gutter white line under a dependency in the project descriptor.
 */
export class DiagnosticsManager implements ExtensionComponent {
    private _codeActionProviders: AbstractFileActionProvider[] = [];

    constructor(treesManager: TreesManager, updateManager: DependencyUpdateManager) {
        let diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection();

        this._codeActionProviders.push(
            new DescriptorActionProvider(diagnosticCollection, treesManager, updateManager),
            new CodeFileActionProvider(diagnosticCollection, treesManager)
        );
    }

    public activate(context: vscode.ExtensionContext): DiagnosticsManager {
        this._codeActionProviders.forEach(codeActionProvider => codeActionProvider.activate(context));
        this.updateDiagnostics();
        return this;
    }

    public clearDiagnostics() {
        if (this._codeActionProviders && this._codeActionProviders.length > 0) {
            this._codeActionProviders.forEach(codeActionProvider => codeActionProvider.clearDiagnostics());
        }
    }

    public updateDiagnostics() {
        if (this._codeActionProviders && this._codeActionProviders.length > 0) {
            vscode.workspace.textDocuments.forEach(document => {
                if (!document.isClosed) {
                    this._codeActionProviders.forEach(codeActionProvider => codeActionProvider.updateDiagnostics(document));
                }
            });
        }
    }
}
