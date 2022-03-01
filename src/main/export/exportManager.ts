import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { CsvVulnerabilitiesExporter } from './csv/csvVulnerabilitiesExporter';

enum ExportTypes {
    CSV_VULNERABILITIES = '$(file-text)   CSV - Vulnerabilities'
}

/**
 * Manage the export of the components tree to a desired format.
 */
export class ExportManager implements ExtensionComponent {
    constructor(private _workspaceFolders: vscode.WorkspaceFolder[], private _treeManager: TreesManager) {}

    public activate() {
        return this;
    }

    public async showExportMenu() {
        let choice: string | undefined = await vscode.window.showQuickPick(this.getExports(), <vscode.QuickPickOptions>{
            placeHolder: 'Export',
            canPickMany: false
        });
        switch (choice) {
            case ExportTypes.CSV_VULNERABILITIES:
                return await new CsvVulnerabilitiesExporter(this.getRoot(), this._treeManager.scanCacheManager).generateVulnerabilitiesReportFile(
                    this._workspaceFolders
                );
        }
    }

    private getExports(): string[] {
        let results: string[] = [];
        let root: DependenciesTreeNode = this.getRoot();
        // If there are any issues, allow exporting vulnerabilities.
        if (!root.issues.isEmpty() || root.children.some(element => !element.issues.isEmpty())) {
            results.push(ExportTypes.CSV_VULNERABILITIES);
        }
        return results;
    }

    private getRoot(): DependenciesTreeNode {
        let filteredTree: DependenciesTreeNode | undefined = this._treeManager.dependenciesTreeDataProvider.filteredDependenciesTree;
        return filteredTree ? filteredTree : this._treeManager.dependenciesTreeDataProvider.dependenciesTree;
    }
}
