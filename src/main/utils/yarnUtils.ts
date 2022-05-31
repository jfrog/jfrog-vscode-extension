import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { YarnTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/yarnTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ProjectDetails } from '../types/component';
import { GeneralInfo } from '../types/generalInfo';
import { PackageType } from '../types/projectType';
import { NpmGlobalScopes, ScopedNpmProject } from './npmUtils';
import { ScanUtils } from './scanUtils';

export class YarnUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/yarn.lock' };
    public static readonly PKG_TYPE: string = 'yarn';

    /**
     * Get yarn.lock file and return the start position of the dependencies.
     * @param document - yarn.lock file
     */
    public static getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        let res: vscode.Position[] = [];
        let yarnLockContent: string = document.getText();
        let dependenciesMatch: RegExpMatchArray | null = yarnLockContent.match('[/s/S]*:');
        if (!dependenciesMatch) {
            return res;
        }
        let dependenciesPos: vscode.Position = new vscode.Position(document.positionAt(<number>dependenciesMatch.index).line, 0);
        res.push(dependenciesPos);
        res.push(dependenciesPos);
        return res;
    }

    /**
     * Get yarn.lock file and dependencies tree node. return the position of the dependency in the yarn.lock file.
     * @param document             - yarn.lock file
     * @param dependenciesTreeNode - dependencies tree node
     */
    public static getDependencyPos(document: vscode.TextDocument, dependenciesTreeNode: DependenciesTreeNode): vscode.Position[] {
        let res: vscode.Position[] = [];
        let yarnLockContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = yarnLockContent.match(`([\r\n"]+)(${dependenciesTreeNode.generalInfo.artifactId}@\\S*)[:, ]`);
        if (!dependencyMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependencyMatch.index + dependencyMatch[1].length));
        res.push(new vscode.Position(res[0].line, dependencyMatch[2].length));
        return res;
    }

    /**
     * @param yarnLock         - Paths to yarn.lock files
     * @param componentsToScan - Set of yarn components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - The trees manager
     * @param parent           - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        yarnLocks: vscode.Uri[] | undefined,
        projectsToScan: ProjectDetails[],
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<void> {
        if (!yarnLocks) {
            treesManager.logManager.logMessage('No yarn.lock files found in workspaces.', 'DEBUG');
            return;
        }
        treesManager.logManager.logMessage('yarn.lock files to scan: [' + yarnLocks.toString() + ']', 'DEBUG');
        for (let yarnLock of yarnLocks) {
            // In yarn, the version may vary in different workspaces. Therefore we run 'yarn --version' for each workspace.
            if (!YarnUtils.isVersionSupported(parent, treesManager.logManager, path.dirname(yarnLock.fsPath), quickScan)) {
                return;
            }
            const projectToScan: ProjectDetails = new ProjectDetails(path.dirname(yarnLock.fsPath), PackageType.YARN);
            projectsToScan.push(projectToScan);
            let dependenciesTreeNode: YarnTreeNode = new YarnTreeNode(path.dirname(yarnLock.fsPath), projectToScan, treesManager, parent);
            dependenciesTreeNode.refreshDependencies(quickScan);
        }
    }

    public static isVersionSupported(parent: DependenciesTreeNode, logManager: LogManager, workspaceFolder: string, quickScan: boolean): boolean {
        try {
            let version: string = ScanUtils.executeCmd('yarn --version', workspaceFolder).toString();
            let yarnSemver: semver.SemVer = new semver.SemVer(version);
            if (yarnSemver.compare('2.0.0') >= 0) {
                logManager.logError(new Error('Could not scan Yarn project dependencies, because currently only Yarn 1 is supported.'), !quickScan);
                let yarnProject: ScopedNpmProject = this.getYarnProjectDetails(workspaceFolder);
                let generalInfo: GeneralInfo = new GeneralInfo(
                    (yarnProject.projectName || workspaceFolder) + ` [Not supported]`,
                    yarnProject.projectVersion,
                    [],
                    workspaceFolder,
                    YarnUtils.PKG_TYPE
                );
                new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.None, parent);
                return false;
            }
        } catch (error) {
            logManager.logError(new Error('Could not scan Yarn project dependencies, because Yarn is not installed.'), !quickScan);
            return false;
        }
        return true;
    }

    /**
     * Return ScopedNpmProject which contain the name and version of Yarn project.
     * The name and version are extracted from the package.json.
     * @param workspaceFolder - The workspace folder
     * @returns ScopedNpmProject
     */
    public static getYarnProjectDetails(workspaceFolder: string): ScopedNpmProject {
        const yarnProject: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.PRODUCTION);
        yarnProject.loadProjectDetailsFromFile(path.join(workspaceFolder, 'package.json'));
        return yarnProject;
    }
}
