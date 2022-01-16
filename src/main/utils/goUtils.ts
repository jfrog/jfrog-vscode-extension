import { execSync } from 'child_process';
import { ComponentDetails } from 'jfrog-client-js';
import * as path from 'path';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { FocusType } from '../focus/abstractFocus';
import { GoTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';

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
    public static getDependencyPos(
        document: vscode.TextDocument,
        dependenciesTreeNode: DependenciesTreeNode,
        focusType: FocusType
    ): vscode.Position[] {
        let res: vscode.Position[] = [];
        let goModContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = goModContent.match('(' + dependenciesTreeNode.generalInfo.artifactId + 's* )vs*.*');
        if (!dependencyMatch) {
            return res;
        }
        switch (focusType) {
            case FocusType.Dependency:
                res.push(document.positionAt(<number>dependencyMatch.index));
                break;
            case FocusType.DependencyVersion:
                res.push(document.positionAt(<number>dependencyMatch.index + dependencyMatch[1].length));
                break;
        }
        res.push(new vscode.Position(res[0].line, res[0].character + dependencyMatch[0].length));
        return res;
    }

    /**
     * @param goMods           - Paths to go.mod files
     * @param componentsToScan - Set of go components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - Scan trees manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        goMods: vscode.Uri[] | undefined,
        componentsToScan: Set<ComponentDetails>,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<void> {
        if (!goMods) {
            treesManager.logManager.logMessage('No go.mod files found in workspaces.', 'DEBUG');
            return;
        }
        treesManager.logManager.logMessage('go.mod files to scan: [' + goMods.toString() + ']', 'DEBUG');
        if (!GoUtils.verifyGoInstalled()) {
            treesManager.logManager.logError(new Error('Could not scan go project dependencies, because go CLI is not in the PATH.'), !quickScan);
            return;
        }
        for (let goMod of goMods) {
            treesManager.logManager.logMessage('Analyzing go.mod files', 'INFO');
            let dependenciesTreeNode: GoTreeNode = new GoTreeNode(path.dirname(goMod.fsPath), componentsToScan, treesManager, parent);
            dependenciesTreeNode.refreshDependencies(quickScan);
        }
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
