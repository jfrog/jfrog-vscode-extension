import { execSync } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { FocusType } from '../focus/abstractFocus';
import { NpmTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/npmTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ProjectDetails } from '../types/component';
import { PackageType } from '../types/projectType';
import * as fs from 'fs';

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
    public static getDependencyPos(
        document: vscode.TextDocument,
        dependenciesTreeNode: DependenciesTreeNode,
        focusType: FocusType
    ): vscode.Position[] {
        let res: vscode.Position[] = [];
        let packageJsonContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = packageJsonContent.match(
            '("' + dependenciesTreeNode.generalInfo.artifactId + '"\\s*:\\s*).*"'
        );
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
     * @param packageJsons     - Paths to package.json files
     * @param componentsToScan - Set of npm components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - The trees manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        packageJsons: vscode.Uri[] | undefined,
        projectsToScan: ProjectDetails[],
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<void> {
        if (!packageJsons) {
            treesManager.logManager.logMessage('No package.json files found in workspaces.', 'DEBUG');
            return;
        }
        if (!NpmUtils.verifyNpmInstalled()) {
            treesManager.logManager.logError(new Error('Could not scan npm project dependencies, because npm CLI is not in the PATH.'), !quickScan);
            return;
        }
        treesManager.logManager.logMessage('package.json files to scan: [' + packageJsons.toString() + ']', 'DEBUG');
        for (let packageJson of packageJsons) {
            const projectToScan: ProjectDetails = new ProjectDetails(path.dirname(packageJson.fsPath), PackageType.NPM);
            projectsToScan.push(projectToScan);
            let dependenciesTreeNode: NpmTreeNode = new NpmTreeNode(path.dirname(packageJson.fsPath), projectToScan, treesManager, parent);
            dependenciesTreeNode.refreshDependencies(quickScan);
        }
    }

    public static verifyNpmInstalled(): boolean {
        try {
            execSync('npm --version');
        } catch (error) {
            return false;
        }
        return true;
    }

    public static getDependencyScope(dep: string): string {
        if (dep !== '' && dep[0] === '@') {
            return dep.substring(1, dep.indexOf('/'));
        }
        return '';
    }
}

export class ScopedNpmProject {
    private _projectName: string = '';
    private _projectVersion: string = '';
    private _dependencies: any;
    private _scope: NpmGlobalScopes;

    constructor(scope: NpmGlobalScopes) {
        this._scope = scope;
    }

    public get projectName(): string {
        return this._projectName;
    }

    public set projectName(projectName: string) {
        this._projectName = projectName;
    }

    public get projectVersion(): string {
        return this._projectVersion;
    }

    public set projectVersion(projectVersion: string) {
        this._projectVersion = projectVersion;
    }

    public get dependencies() {
        return this._dependencies;
    }

    public loadProjectDetails(lsOutput: any) {
        this._projectName = lsOutput.name;
        this._projectVersion = lsOutput.version;
        this._dependencies = lsOutput.dependencies;
    }

    public loadProjectDetailsFromFile(filePath: any) {
        let content: string = fs.readFileSync(filePath, 'utf8');
        const fileData: any = JSON.parse(content);
        this._projectName = fileData.name;
        this._projectVersion = fileData.version;
    }

    public get scope(): NpmGlobalScopes {
        return this._scope;
    }
}

// For compatibility with npm 6,7,8, scope must be one of: 'dev' or 'prod'!
export enum NpmGlobalScopes {
    PRODUCTION = 'prod',
    DEVELOPMENT = 'dev'
}
