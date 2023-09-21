import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { YarnTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/yarnTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GeneralInfo } from '../types/generalInfo';
import { ProjectDetails } from './npmUtils';
import { ScanUtils } from './scanUtils';
import { PackageType } from '../types/projectType';
import { BuildTreeErrorType } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';

export class YarnUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/yarn.lock' };
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
    public static getDependencyPosition(document: vscode.TextDocument, artifactId: string): vscode.Range[] {
        let res: vscode.Range[] = [];
        let yarnLockContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = yarnLockContent.match(`([\r\n"]+)(${artifactId}@\\S*)[:, ]`);
        if (!dependencyMatch) {
            return res;
        }
        let startPos: vscode.Position = document.positionAt(<number>dependencyMatch.index + dependencyMatch[1].length);
        res.push(new vscode.Range(startPos, new vscode.Position(startPos.line, dependencyMatch[2].length)));
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
        logManager: LogManager,
        checkCanceled: () => void,
        parent: DependenciesTreeNode
    ): Promise<void> {
        if (!yarnLocks) {
            logManager.logMessage('No yarn.lock files found in workspaces.', 'DEBUG');
            return;
        }
        logManager.logMessage('yarn.lock files to scan: [' + yarnLocks.toString() + ']', 'DEBUG');
        for (let yarnLock of yarnLocks) {
            checkCanceled();
            let root: YarnTreeNode = new YarnTreeNode(yarnLock.fsPath, logManager, parent);
            // In yarn, the version may vary in different workspaces. Therefore we run 'yarn --version' for each workspace.
            root.buildError = YarnUtils.isVersionSupported(parent, logManager, path.dirname(yarnLock.fsPath));
            if (root.buildError) {
                return;
            }
            checkCanceled();

            root.loadYarnDependencies();
        }
    }

    public static isVersionSupported(parent: DependenciesTreeNode, logManager: LogManager, workspaceFolder: string): BuildTreeErrorType | undefined {
        try {
            let version: string = ScanUtils.executeCmd('yarn --version', workspaceFolder).toString();
            let yarnSemver: semver.SemVer = new semver.SemVer(version);
            if (yarnSemver.compare('2.0.0') >= 0) {
                logManager.logError(new Error('Could not scan Yarn project dependencies, because currently only Yarn 1 is supported.'), true);
                let yarnProject: ProjectDetails = this.getYarnProjectDetails(workspaceFolder);
                let generalInfo: GeneralInfo = new GeneralInfo(
                    yarnProject.projectName || workspaceFolder,
                    yarnProject.projectVersion,
                    [],
                    workspaceFolder,
                    PackageType.Yarn
                );
                new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.None, parent);
                return BuildTreeErrorType.NotSupported;
            }
        } catch (error) {
            logManager.logError(new Error('Could not scan Yarn project dependencies, because Yarn is not installed.'), true);
            return BuildTreeErrorType.NotInstalled;
        }
        return undefined;
    }

    /**
     * Return ScopedNpmProject which contain the name and version of Yarn project.
     * The name and version are extracted from the package.json.
     * @param workspaceFolder - The workspace folder
     * @returns ScopedNpmProject
     */
    public static getYarnProjectDetails(workspaceFolder: string): ProjectDetails {
        const yarnProject: ProjectDetails = new ProjectDetails();
        yarnProject.loadProjectDetailsFromFile(path.join(workspaceFolder, 'package.json'));
        return yarnProject;
    }
}
