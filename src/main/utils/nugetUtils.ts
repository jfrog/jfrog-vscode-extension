import { ComponentDetails } from 'jfrog-client-js';
import { NugetDepsTree } from 'nuget-deps-tree';
import * as path from 'path';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { NugetTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/nugetTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';

export class NugetUtils {
    public static readonly PKG_TYPE: string = 'nuget';

    /**
     * @param workspaceFolders - Base workspace folders
     * @param componentsToScan - Set of nuget components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param scanCacheManager - Scan cache manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        solutions: vscode.Uri[] | undefined,
        componentsToScan: Set<ComponentDetails>,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<NugetTreeNode[]> {
        if (!solutions) {
            treesManager.logManager.logMessage('No *.sln files found in workspaces.', 'DEBUG');
            return [];
        }

        treesManager.logManager.logMessage('Solution files to scan: [' + solutions.toString() + ']', 'DEBUG');
        let nugetTreeNodes: NugetTreeNode[] = [];
        for (let solution of solutions) {
            let tree: any = await NugetUtils.getProjects(solution.fsPath, treesManager.logManager, quickScan);
            if (!tree) {
                continue;
            }
            for (let project of tree.projects) {
                let dependenciesTreeNode: NugetTreeNode = new NugetTreeNode(path.dirname(solution.fsPath), componentsToScan, treesManager, parent);
                dependenciesTreeNode.refreshDependencies(quickScan, project);
                nugetTreeNodes.push(dependenciesTreeNode);
            }
        }
        return nugetTreeNodes;
    }

    /**
     * Get the projects tree for the provided solution file. Solution has to be pre restored.
     * @param slnFilePath - Path to solution
     * @param logManager  - Log manager
     * @param quickScan   - True to allow using the scan cache
     */
    private static async getProjects(slnFilePath: string, logManager: LogManager, quickScan: boolean): Promise<any> {
        let nugetList: any;
        try {
            nugetList = NugetDepsTree.generate(slnFilePath);
        } catch (error) {
            logManager.logError(error, !quickScan);
            logManager.logMessage(
                'Failed building tree for solution "' + slnFilePath + '", due to the above error. Skipping to next solution... ',
                'INFO'
            );
            return null;
        }

        if (!nugetList.projects) {
            logManager.logError(new Error('No projects found for solution "' + slnFilePath + '".'), !quickScan);
            logManager.logMessage(
                'Possible cause: The solution needs to be restored. Restore it by running "nuget restore ' + slnFilePath + '".',
                'INFO'
            );
            return null;
        }
        return nugetList;
    }
}
