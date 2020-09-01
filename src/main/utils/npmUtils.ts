import { execSync } from 'child_process';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { NpmTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/npmTree';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ScanUtils } from './scanUtils';
import { LogManager } from '../log/logManager';

export class NpmUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/package.json' };
    public static readonly PKG_TYPE: string = 'npm';

    /**
     * Get package.json file and return the position of 'dependencies' section.
     * @param document - package.json file
     */
    public static getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        let res: vscode.Position[] = [];
        let packageJsonContent: string = document.getText();
        let dependenciesMatch: RegExpMatchArray | null = packageJsonContent.match('"((devD)|(d))ependencies"s*:s*');
        if (!dependenciesMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependenciesMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependenciesMatch[0].length));
        return res;
    }

    /**
     * Get package.json file and dependencies tree node. return the position of the dependency in the package.json file.
     * @param document             - package.json file
     * @param dependenciesTreeNode - dependencies tree node
     */
    public static getDependencyPos(document: vscode.TextDocument, dependenciesTreeNode: DependenciesTreeNode): vscode.Position[] {
        let res: vscode.Position[] = [];
        let packageJsonContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = packageJsonContent.match('"' + dependenciesTreeNode.generalInfo.artifactId + '"s*:s*.*"');
        if (!dependencyMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependencyMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependencyMatch[0].length));
        return res;
    }

    /**
     * Find package.json files in workspaces.
     * @param workspaceFolders - Base workspace folders to search
     * @param logManager       - Log manager
     */
    public static async locatePackageJsons(workspaceFolders: vscode.WorkspaceFolder[], logManager: LogManager): Promise<Collections.Set<vscode.Uri>> {
        let packageJsons: Collections.Set<vscode.Uri> = new Collections.Set();
        for (let workspace of workspaceFolders) {
            logManager.logMessage('Locating package json files in workspace "' + workspace.name + '".', 'INFO');
            let wsPackageJsons: vscode.Uri[] = await vscode.workspace.findFiles(
                { base: workspace.uri.fsPath, pattern: '**/package.json' },
                ScanUtils.getScanExcludePattern(workspace)
            );
            wsPackageJsons.forEach(packageJson => packageJsons.add(packageJson));
        }
        return Promise.resolve(packageJsons);
    }

    /**
     * @param workspaceFolders - Base workspace folders
     * @param componentsToScan - Set of npm components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
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
    ): Promise<NpmTreeNode[]> {
        let packageJsons: Collections.Set<vscode.Uri> = await NpmUtils.locatePackageJsons(workspaceFolders, treesManager.logManager);
        if (packageJsons.isEmpty()) {
            treesManager.logManager.logMessage('No package.json files found in workspaces.', 'DEBUG');
            return [];
        }
        if (!NpmUtils.verifyNpmInstalled()) {
            vscode.window.showErrorMessage('Could not scan npm project dependencies, because npm CLI is not in the PATH.');
            return [];
        }
        treesManager.logManager.logMessage('package.json files to scan: [' + packageJsons.toString() + ']', 'DEBUG');
        let npmTreeNodes: NpmTreeNode[] = [];
        for (let packageJson of packageJsons.toArray()) {
            let dependenciesTreeNode: NpmTreeNode = new NpmTreeNode(path.dirname(packageJson.fsPath), componentsToScan, treesManager, parent);
            dependenciesTreeNode.refreshDependencies(quickScan);
            npmTreeNodes.push(dependenciesTreeNode);
        }
        return npmTreeNodes;
    }

    public static verifyNpmInstalled(): boolean {
        try {
            execSync('npm --version');
        } catch (error) {
            return false;
        }
        return true;
    }
}
