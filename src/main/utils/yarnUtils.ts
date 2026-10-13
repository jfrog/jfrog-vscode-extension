import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { YarnTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/yarnTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { ScanUtils } from './scanUtils';
import { BuildTreeErrorType } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { YarnStrategy } from './yarn/yarnStrategy';
import { YarnClassicStrategy } from './yarn/yarnClassicStrategy';
import { YarnBerryStrategy } from './yarn/yarnBerryStrategy';

export class YarnVersionMismatchError extends Error {}

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
            let strategy: YarnStrategy;
            try {
                // In yarn, the version may vary in different workspaces. Therefore we run 'yarn --version' for each workspace.
                strategy = YarnUtils.getStrategy(path.dirname(yarnLock.fsPath));
            } catch (error) {
                if (error instanceof YarnVersionMismatchError) {
                    logManager.logError(error, true);
                } else {
                    logManager.logError(new Error('Could not scan Yarn project dependencies, because Yarn is not installed.'), true);
                }
                root.buildError = BuildTreeErrorType.NotInstalled;
                return;
            }
            checkCanceled();

            root.loadYarnDependencies(strategy);
        }
    }

    /**
     * @param workspaceFolder - The folder containing the yarn.lock
     * @returns The strategy matching the Yarn version that runs in the workspace folder
     * @throws if Yarn is not installed, or if it does not match the version that the project declares
     */
    public static getStrategy(workspaceFolder: string): YarnStrategy {
        const version: semver.SemVer = new semver.SemVer(
            ScanUtils.executeCmd('yarn --version', workspaceFolder)
                .toString()
                .trim()
        );
        YarnUtils.verifyDeclaredVersion(workspaceFolder, version);
        return version.major >= 2 ? new YarnBerryStrategy() : new YarnClassicStrategy();
    }

    /**
     * Yarn 1 refuses to run in a project that declares Yarn 2+ in 'packageManager', unless Corepack selects the declared version.
     * @param workspaceFolder - The folder containing the package.json
     * @param activeVersion - The version that 'yarn --version' returned in the folder
     * @throws YarnVersionMismatchError if the project declares Yarn 2+ while an older Yarn is active
     */
    public static verifyDeclaredVersion(workspaceFolder: string, activeVersion: semver.SemVer): void {
        const declared: string | undefined = YarnUtils.getDeclaredPackageManager(workspaceFolder);
        const declaredMajor: string | undefined = declared?.match(/^yarn@(\d+)\./)?.[1];
        if (declared && declaredMajor && Number(declaredMajor) >= 2 && activeVersion.major < Number(declaredMajor)) {
            throw new YarnVersionMismatchError(
                `Could not scan Yarn project dependencies. The project declares "packageManager": "${declared.split('+')[0]}" in package.json, ` +
                    `but the active Yarn version is ${activeVersion.version}. Run "corepack enable" and scan again.`
            );
        }
    }

    private static getDeclaredPackageManager(workspaceFolder: string): string | undefined {
        try {
            const packageManager: any = JSON.parse(fs.readFileSync(path.join(workspaceFolder, 'package.json'), 'utf8')).packageManager;
            return typeof packageManager === 'string' ? packageManager : undefined;
        } catch (error) {
            return undefined;
        }
    }
}
