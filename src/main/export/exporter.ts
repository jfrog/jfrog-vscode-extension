import * as fs from 'fs';
import * as path from 'path';
import Dictionary from 'typescript-collections/dist/lib/Dictionary';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { IIssueKey } from '../types/issueKey';
import { ExportableVulnerability } from './exportable/exportableVulnerability';

export abstract class Exporter {
    private static FILE_SAVE_LABEL: string = 'Export';

    constructor(private _root: DependenciesTreeNode, private _scanCacheManager: ScanCacheManager) {}
    /**
     * Generate vulnerabilities report that may be exported to a file.
     *
     * @return vulnerabilities report text.
     */
    public abstract generateVulnerabilitiesReportData(): Promise<string>;

    /**
     * Create a single exportable vulnerability.
     *
     * @param directDependency - The direct dependency ID in the dependency tree
     * @param issueKey         - The issue ID and component.
     * @param issue            - The issue details.
     * @return a single exportable vulnerability.
     */
    protected abstract createExportableVulnerability(
        directDependency: DependenciesTreeNode,
        issueKey: IIssueKey,
        issue: IIssueCacheObject
    ): ExportableVulnerability;

    /**
     * Get the filename to propose for the exported data.
     *
     * @return default filename.
     */
    public abstract getProposedFileName(): string;

    /**
     * Collect the exportable vulnerabilities to export.
     *
     * @return the exportable vulnerabilities to export.
     */
    async collectVulnerabilities(): Promise<ExportableVulnerability[]> {
        let exportableVulnerabilities: Dictionary<string, ExportableVulnerability> = new Dictionary();
        this.populateExportableVulnerabilities(this._root, exportableVulnerabilities);
        return exportableVulnerabilities.values();
    }

    private async populateExportableVulnerabilities(
        node: DependenciesTreeNode,
        exportableVulnerabilities: Dictionary<string, ExportableVulnerability>
    ) {
        if (node instanceof RootNode || !node.parent) {
            // Node is an ancestor of a direct dependency
            node.children.forEach(child => {
                this.populateExportableVulnerabilities(child, exportableVulnerabilities);
            });
            return;
        }

        // Node is a direct dependency
        node.issues.forEach(issue => {
            if (exportableVulnerabilities.containsKey(issue.issue_id)) {
                let exportable: ExportableVulnerability | undefined = exportableVulnerabilities.getValue(issue.issue_id);
                // ExportableVulnerability already exists in the map, Append the direct dependency to it.
                exportable?.appendDirectDependency(node);
            } else {
                // ExportableVulnerability is new. Add it to the map.
                let issueCacheObject: IIssueCacheObject | undefined = this._scanCacheManager.getIssue(issue.issue_id);
                if (!issueCacheObject) {
                    return;
                }
                exportableVulnerabilities.setValue(issue.issue_id, this.createExportableVulnerability(node, issue, issueCacheObject));
            }
        });
    }

    /**
     * Generates a vulnerabilities report, opens a "save as" window and saves the report to the selected path.
     */
    async generateVulnerabilitiesReportFile(workspaceFolders: vscode.WorkspaceFolder[]) {
        let exportData: string = await this.generateVulnerabilitiesReportData();
        vscode.window
            .showSaveDialog({ defaultUri: this.getProposedFilePath(workspaceFolders), saveLabel: Exporter.FILE_SAVE_LABEL })
            .then(fileInfos => {
                if (fileInfos) {
                    fs.writeFileSync(fileInfos.path, exportData);
                }
            });
    }

    private getProposedFilePath(workspaceFolders: vscode.WorkspaceFolder[]): vscode.Uri {
        if (workspaceFolders && workspaceFolders[0]) {
            return vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, this.getProposedFileName()));
        }
        return vscode.Uri.file(this.getProposedFileName());
    }
}
