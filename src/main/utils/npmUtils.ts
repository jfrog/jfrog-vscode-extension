import { execSync } from 'child_process';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { NpmTreeNode } from '../treeDataProviders/dependenciesTree/npmTreeNode';
import { ScanUtils } from './scanUtils';

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
     * @param progress         - progress bar
     */
    public static async locatePackageJsons(
        workspaceFolders: vscode.WorkspaceFolder[],
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<Collections.Set<vscode.Uri>> {
        let packageJsons: Collections.Set<vscode.Uri> = new Collections.Set();
        for (let workspace of workspaceFolders) {
            let excludePatterns: string | null = ScanUtils.getScanExcludePattern(workspace) || null;
            progress.report({ message: 'Locating package json files in workspace ' + workspace.name });
            let wsPackageJsons: vscode.Uri[] = await vscode.workspace.findFiles(
                { base: workspace.uri.fsPath, pattern: '**/package.json' },
                excludePatterns
            );
            wsPackageJsons.forEach(packageJson => packageJsons.add(packageJson));
        }
        return Promise.resolve(packageJsons);
    }

    /**
     * @param workspaceFolders - Base workspace folders
     * @param progress         - Progress bar
     * @param componentsToScan - Set of npm components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param scanCacheManager - Scan cache manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Collections.Set<ComponentDetails>,
        scanCacheManager: ScanCacheManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<NpmTreeNode[]> {
        let packageJsons: Collections.Set<vscode.Uri> = await NpmUtils.locatePackageJsons(workspaceFolders, progress);
        if (packageJsons.isEmpty()) {
            // This is necessary for
            return [];
        }
        if (!NpmUtils.verifyNpmInstalled()) {
            vscode.window.showErrorMessage('Could not scan npm project dependencies, because npm CLI is not in the PATH.');
            return [];
        }
        let npmTreeNodes: NpmTreeNode[] = [];
        for (let packageJson of packageJsons.toArray()) {
            progress.report({ message: 'Analyzing package.json files' });
            let dependenciesTreeNode: NpmTreeNode = new NpmTreeNode(path.dirname(packageJson.fsPath), componentsToScan, scanCacheManager, parent);
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
