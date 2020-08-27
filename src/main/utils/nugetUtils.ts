import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { NugetTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/nugetTree';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ScanUtils } from './scanUtils';
import { LogManager } from '../log/logManager';
import { NugetDepsTree } from './nugetDepsTree';

export class NugetUtils {
    public static readonly PKG_TYPE: string = 'nuget';

    /**
     * Find .sln files in workspaces.
     * @param workspaceFolders - Base workspace folders to search
     * @param logManager       - Log manager
     */
    public static async locateSolutions(workspaceFolders: vscode.WorkspaceFolder[], logManager: LogManager): Promise<Collections.Set<vscode.Uri>> {
        let solutions: Collections.Set<vscode.Uri> = new Collections.Set();
        for (let workspace of workspaceFolders) {
            logManager.logMessage('Locating *.sln files in workspace' + workspace.name, 'INFO');
            let wsSolutions: vscode.Uri[] = await vscode.workspace.findFiles(
                { base: workspace.uri.fsPath, pattern: '**/*.sln' },
                ScanUtils.getScanExcludePattern(workspace)
            );
            wsSolutions.forEach(solution => solutions.add(solution));
        }
        return Promise.resolve(solutions);
    }
    
    /**
     * @param workspaceFolders - Base workspace folders
     * @param componentsToScan - Set of nuget components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param scanCacheManager - Scan cache manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        componentsToScan: Collections.Set<ComponentDetails>,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<NugetTreeNode[]> {
        let solutions: Collections.Set<vscode.Uri> = await NugetUtils.locateSolutions(workspaceFolders, treesManager.logManager);
        if (solutions.isEmpty()) {
            treesManager.logManager.logMessage('No *.sln files found in workspaces.', 'DEBUG');
            return [];
        }
    
        treesManager.logManager.logMessage('.sln files to scan: [' + solutions.toString() + ']', 'DEBUG');
        let nugetTreeNodes: NugetTreeNode[] = [];
        for (let solution of solutions.toArray()) {
            let tree: any = await NugetUtils.getProjects(solution.fsPath, treesManager.logManager, quickScan);
            for (let project of tree.projects) {
                let dependenciesTreeNode: NugetTreeNode = new NugetTreeNode(path.dirname(solution.fsPath), componentsToScan, treesManager, parent);
                dependenciesTreeNode.refreshDependencies(quickScan, project);
                nugetTreeNodes.push(dependenciesTreeNode);
            }
        }
        return nugetTreeNodes;

    }

    private static async getProjects(slnFilePath: string, logManager: LogManager, quickScan: boolean) : Promise<any> {
        let nugetList: any;
        try {
            nugetList = JSON.parse(NugetDepsTree.buildTree(slnFilePath));
        } catch (error) {
            logManager.logError(error, !quickScan);
        }
        return nugetList;
    }
}
