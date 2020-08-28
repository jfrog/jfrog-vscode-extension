import { execSync } from 'child_process';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GoTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ScanUtils } from './scanUtils';
import { LogManager } from '../log/logManager';

export class GoUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/go.mod' };
    public static readonly PKG_TYPE: string = 'go';

    /**
     * Get go.mod file and return the position of 'require' section.
     * @param document - go.mod file
     */
    public static getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        let res: vscode.Position[] = [];
        let goModContent: string = document.getText();
        let dependenciesMatch: RegExpMatchArray | null = goModContent.match('require');
        if (!dependenciesMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependenciesMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependenciesMatch[0].length));
        return res;
    }

    /**
     * Get go.mod file and dependencies tree node. return the position of the dependency in the go.mod file.
     * @param document             - go.mod file
     * @param dependenciesTreeNode - dependencies tree node
     */
    public static getDependencyPos(document: vscode.TextDocument, dependenciesTreeNode: DependenciesTreeNode): vscode.Position[] {
        let res: vscode.Position[] = [];
        let goModContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = goModContent.match(dependenciesTreeNode.generalInfo.artifactId + 's* vs*.*');
        if (!dependencyMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependencyMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependencyMatch[0].length));
        return res;
    }

    /**
     * Find go.mod files in workspaces.
     * @param workspaceFolders - Base workspace folders to search
     * @param logManager       - Log manager
     */
    public static async locateGoMods(workspaceFolders: vscode.WorkspaceFolder[], logManager: LogManager): Promise<Collections.Set<vscode.Uri>> {
        let goMods: Collections.Set<vscode.Uri> = new Collections.Set();
        for (let workspace of workspaceFolders) {
            logManager.logMessage('Locating go.mod files in workspace "' + workspace.name + '".', 'INFO');
            let wsGoMods: vscode.Uri[] = await vscode.workspace.findFiles(
                { base: workspace.uri.fsPath, pattern: '**/go.mod' },
                ScanUtils.getScanExcludePattern(workspace)
            );
            wsGoMods.forEach(goMod => goMods.add(goMod));
        }
        return Promise.resolve(goMods);
    }

    /**
     * @param workspaceFolders - Base workspace folders
     * @param progress         - Progress bar
     * @param componentsToScan - Set of go components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param scanCacheManager - Scan cache manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        componentsToScan: Collections.Set<ComponentDetails>,
        goCenterComponentsToScan: Collections.Set<ComponentDetails>,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<GoTreeNode[]> {
        let goMods: Collections.Set<vscode.Uri> = await GoUtils.locateGoMods(workspaceFolders, treesManager.logManager);
        if (goMods.isEmpty()) {
            treesManager.logManager.logMessage('No go.mod files found in workspaces.', 'DEBUG');
            return [];
        }
        treesManager.logManager.logMessage('go.mod files to scan: [' + goMods.toString() + ']', 'DEBUG');
        if (!GoUtils.verifyGoInstalled()) {
            vscode.window.showErrorMessage('Could not scan go project dependencies, because go CLI is not in the PATH.');
            return [];
        }
        let goTreeNodes: GoTreeNode[] = [];
        for (let goMod of goMods.toArray()) {
            treesManager.logManager.logMessage('Analyzing go.mod files', 'INFO');
            let dependenciesTreeNode: GoTreeNode = new GoTreeNode(
                path.dirname(goMod.fsPath),
                componentsToScan,
                goCenterComponentsToScan,
                treesManager,
                parent
            );
            dependenciesTreeNode.refreshDependencies(quickScan);
            goTreeNodes.push(dependenciesTreeNode);
        }
        return goTreeNodes;
    }

    public static verifyGoInstalled(): boolean {
        try {
            execSync('go version');
        } catch (error) {
            return false;
        }
        return true;
    }
}
