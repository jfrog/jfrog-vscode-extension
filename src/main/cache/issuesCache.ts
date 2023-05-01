import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { DescriptorTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils } from '../treeDataProviders/utils/analyzerUtils';
import { DependencyUtils } from '../treeDataProviders/utils/dependencyUtils';
import { DependencyScanResults, EntryIssuesData, ScanResults } from '../types/workspaceIssuesDetails';
import { ProjectDependencyTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { EnvironmentTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/environmentTreeNode';
import { Utils } from '../utils/utils';

/**
 * Describes a cache that holds all the information from an Xray scan for a workspace
 */
export class IssuesCache {
    public static readonly CACHE_BASE_KEY: string = 'jfrog.cache.issues.';

    constructor(public _cache: vscode.Memento, private _logManager: LogManager) {}

    /**
     * Get the unique key for this workspace
     * @param workspace - the workspace we want to get it's id
     * @returns - the unique key for this workspace
     */
    public static toKey(workspace: vscode.WorkspaceFolder): string {
        return IssuesCache.CACHE_BASE_KEY + workspace.uri.fsPath;
    }

    /**
     * Check if the cache contains data for a given workspace
     * @param workspace - the workspace to search in the cache
     * @returns - true if exists in cache, false otherwise
     */
    public contains(workspace: vscode.WorkspaceFolder): boolean {
        return !this._cache.keys().find(key => key == IssuesCache.toKey(workspace));
    }

    /**
     * Get the workspace issues data that is stored in the cache base on a given workspace
     * @param workspace - the workspace to search it's data
     * @returns WorkspaceIssuesData if exists in cache, false otherwise.
     */
    public get(workspace: vscode.WorkspaceFolder): ScanResults | undefined {
        let rawData: string | undefined = this._cache.get(IssuesCache.toKey(workspace));
        if (rawData) {
            return ScanResults.fromJson(rawData);
        }
        return undefined;
    }

    /**
     * Store a workspace issues data in the cache
     * @param workspace - the workspace to store it's data
     * @param value - the data we want to store
     */
    public store(workspace: vscode.WorkspaceFolder, value: ScanResults) {
        return this._cache.update(IssuesCache.toKey(workspace), JSON.stringify(value));
    }

    /**
     * Remove issues data of workspace from cache
     * @param workspace - the workspace to delete it's data
     */
    public remove(workspace: vscode.WorkspaceFolder) {
        return this._cache.update(IssuesCache.toKey(workspace), undefined);
    }

    /**
     * Get a scan results stored in the cache base on a given workspace and make sure the results are not expired.
     * If the results are not expired (the store interval period has passed) it will be removed them from the cache
     * @param workspace - the workspace to search it's data
     * @returns ScanResults if there are stored and not expired, undefined otherwise.
     */
    public async getOrClearIfExpired(workspace: vscode.WorkspaceFolder): Promise<ScanResults | undefined> {
        let data: ScanResults | undefined = this.get(workspace);
        if (data && Utils.isIssueCacheIntervalPassed(data.oldestScanTimestamp)) {
            this.remove(workspace);
            vscode.window.showInformationMessage("JFrog: Scan results for '" + workspace.name + "' have expired.", ...['Rescan']).then(answer => {
                if (answer === 'Rescan') {
                    vscode.commands.executeCommand('jfrog.xray.refresh');
                }
            });
            return undefined;
        }
        return data;
    }

    /**
     * Async task to load the issues from the last scan of a given workspace
     * @param workspace - the workspace to load it's issues
     * @returns - the workspace issues if the exists, undefined otherwise
     */
    public async loadIssues(workspace: vscode.WorkspaceFolder): Promise<IssuesRootTreeNode | undefined> {
        // Check if data for the workspace exists in the cache
        let scanResults: ScanResults | undefined = await this.getOrClearIfExpired(workspace);
        if (!scanResults) {
            return undefined;
        }
        this._logManager.logMessage("Loading issues from last scan for the workspace '" + workspace.name + "'", 'INFO');
        let root: IssuesRootTreeNode = new IssuesRootTreeNode(workspace);
        if (scanResults.failedFiles) {
            // Load files that had error on the last scan and create tree node in the root
            scanResults.failedFiles.forEach((file: EntryIssuesData) => {
                this._logManager.logMessage("Loading file with scan error '" + file.name + "': '" + file.fullPath + "'", 'DEBUG');
                let failed: FileTreeNode = FileTreeNode.createFailedScanNode(file.fullPath, file.name);
                root.children.push(failed);
            });
        }
        if (scanResults.descriptorsIssues) {
            // Load descriptors issues and create tree node in the root
            scanResults.descriptorsIssues.forEach((graphScanResult: DependencyScanResults) => {
                let projectNode: ProjectDependencyTreeNode = this.createProjectNode(graphScanResult, root);
                this._logManager.logMessage("Loading issues for '" + graphScanResult.fullPath + "'", 'DEBUG');
                DependencyUtils.populateDependencyScanResults(projectNode, graphScanResult);
                if (projectNode instanceof DescriptorTreeNode && graphScanResult.applicableIssues && graphScanResult.applicableIssues.scannedCve) {
                    AnalyzerUtils.populateApplicableIssues(root, projectNode, graphScanResult);
                }
                root.children.push(projectNode);
            });
        }
        if (scanResults.eosScan) {
            root.eosScanTimeStamp = scanResults.eosScanTimestamp;
            AnalyzerUtils.populateEosIssues(root, scanResults);
        }
        return root;
    }

    private createProjectNode(graphScanResult: DependencyScanResults, parent: IssuesRootTreeNode): ProjectDependencyTreeNode {
        return graphScanResult.isEnvironment
            ? new EnvironmentTreeNode(graphScanResult.fullPath, graphScanResult.type, parent)
            : new DescriptorTreeNode(graphScanResult.fullPath, graphScanResult.type, parent);
    }
}
