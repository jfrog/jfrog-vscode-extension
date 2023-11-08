import { execSync } from 'child_process';
import fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import * as walkdir from 'walkdir';
import { SemVer } from 'semver';
import { FocusType } from '../constants/contextKeys';
import { LogManager } from '../log/logManager';
import { GoTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { ScanUtils } from './scanUtils';
import { Utils } from './utils';

export class GoUtils {
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/go.mod' };
    private static readonly GO_MOD_TIDY_CMD: string = 'go mod tidy';
    private static readonly GO_VERSION: string = 'go version';
    // Required files of the gomod-absolutizer Go program.
    private static readonly GO_MOD_ABS_COMPONENTS: string[] = ['go.mod', 'go.sum', 'main.go', 'utils.go'];
    private static readonly GO_MOD_ABS_DIR_NAME: string = 'gomod-absolutizer';

    /**
     * Get the Go version if exists
     * @returns Go version
     */
    public static getGoVersion(): SemVer {
        let versionStr: string = ScanUtils.executeCmd(GoUtils.GO_VERSION)
            .toString()
            .substring('go version go'.length);
        let versionNumber: string = versionStr.substring(0, versionStr.indexOf(' '));
        return new SemVer(versionNumber);
    }

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
     * @param document - go.mod file
     * @param artifactId - dependency id
     * @param focusType - what position to return (dependency / version)
     * @returns the position of the dependency / version in the go.mod file.
     */
    public static getDependencyPosition(document: vscode.TextDocument, artifactId: string, focusType: FocusType): vscode.Range[] {
        let res: vscode.Range[] = [];
        let goModContent: string = document.getText();
        let dependencyMatch: RegExpMatchArray | null = goModContent.match('(' + artifactId + 's* )vs*.*');
        if (!dependencyMatch) {
            return [];
        }
        let startPos: vscode.Position;
        switch (focusType) {
            case FocusType.Dependency:
                startPos = document.positionAt(<number>dependencyMatch.index);
                break;
            case FocusType.DependencyVersion:
                startPos = document.positionAt(<number>dependencyMatch.index + dependencyMatch[1].length);
                break;
        }
        res.push(new vscode.Range(startPos, new vscode.Position(startPos.line, startPos.character + dependencyMatch[0].length)));
        return res;
    }

    /**
     * @param goMods - Paths to go.mod files
     * @param parent - The base tree node
     * @param progressManager - The progressManager to report progress and check cancel
     * @param log - The logger to log information
     */
    public static async createDependenciesTrees(
        goMods: vscode.Uri[] | undefined,
        logManager: LogManager,
        checkCanceled: () => void,
        parent: DependenciesTreeNode
    ): Promise<void> {
        if (!goMods) {
            logManager.logMessage('No go.mod files found in workspaces.', 'DEBUG');
            return;
        }
        logManager.logMessage('go.mod files to scan: [' + goMods.toString() + ']', 'DEBUG');
        if (!GoUtils.verifyGoInstalled()) {
            logManager.logError(new Error('Could not scan go project dependencies, because go CLI is not in the PATH.'), true);
            return;
        }
        let goVersion: SemVer = this.getGoVersion();
        for (let goMod of goMods) {
            checkCanceled();
            logManager.logMessage('Analyzing go.mod file ' + goMod.fsPath, 'INFO');
            let projectDir: string = path.dirname(goMod.fsPath);
            let tmpGoModPath: string = '';
            try {
                tmpGoModPath = this.createGoWorkspace(projectDir, logManager);
                ScanUtils.executeCmd(GoUtils.GO_MOD_TIDY_CMD, path.dirname(tmpGoModPath));
            } catch (error) {
                logManager.logMessage('Failed creating go temporary workspace: ' + error, 'ERR');
                logManager.logMessageAndToastErr(
                    `Failed to scan Go project. Hint: Please make sure the command 'go mod tidy' runs successfully in ` + goMod.fsPath,
                    'ERR'
                );
            }

            let root: GoTreeNode = new GoTreeNode(tmpGoModPath, logManager, parent);
            root.refreshDependencies(goVersion);
            // Set actual paths.
            root.fullPath = goMod.fsPath;
            root.projectDetails.path = projectDir;
            root.generalInfo.path = projectDir;
            root.workspaceFolder = projectDir;

            try {
                await ScanUtils.removeFolder(path.dirname(tmpGoModPath));
            } catch (error) {
                logManager.logMessage('Failed removing go temporary workspace directory: ' + error, 'ERR');
            }
        }
    }

    public static verifyGoInstalled(): boolean {
        try {
            execSync(GoUtils.GO_VERSION);
        } catch (error) {
            return false;
        }
        return true;
    }

    /**
     * Copy go.mod file to a temporary directory.
     * This is necessary to bypass checksum mismatches issues in the original go.sum.
     * @param workspaceDir - Directory of the project for which the temporary workspace is created.
     * @param logManager - logger.
     * @returns - Path to the created temporary directory.
     */
    private static createGoWorkspace(workspaceDir: string, logManager: LogManager): string {
        let targetDir: string = ScanUtils.createTmpDir();
        let goModAbsDir: string = '';

        try {
            goModAbsDir = this.prepareGoModAbs(logManager);
            this.prepareProjectWorkspace(workspaceDir, targetDir, goModAbsDir, logManager, GoUtils.executeGoRun);
        } finally {
            if (goModAbsDir) {
                try {
                    fs.removeSync(goModAbsDir);
                } catch (error) {
                    logManager.logMessage('Unexpected error when removing gomod-absolutizer tmp dir: ' + error, 'DEBUG');
                }
            }
        }
        const tmpGoModPath: string = path.join(targetDir, 'go.mod');
        if (!fs.existsSync(tmpGoModPath)) {
            throw new Error('fail to find temp go.mod while copy go.mod file to a temporary directory at ' + targetDir);
        }
        return tmpGoModPath;
    }

    private static executeGoRun(destPath: string, sourceDir: string, goModAbsDir: string) {
        const cmd: string = `go run . -goModPath=${destPath} -wd=${sourceDir}`;
        ScanUtils.executeCmd(cmd, goModAbsDir);
    }

    /**
     * Copy gomod-absolutizer Go files to a temp directory.
     * The gomod-absolutizer is used to change relative paths in go.mod files to absolute paths.
     *
     * @param logManager - logger.
     * @return Path to the temp directory.
     */
    private static prepareGoModAbs(logManager: LogManager): string {
        let goModAbsDir: string = ScanUtils.createTmpDir();
        this.GO_MOD_ABS_COMPONENTS.forEach(fileName => {
            let orgFile: string = path.join(ScanUtils.RESOURCES_DIR, this.GO_MOD_ABS_DIR_NAME, fileName);
            try {
                fs.copySync(orgFile, path.join(goModAbsDir, fileName));
            } catch (error) {
                logManager.logMessage(
                    'Failed while building the Go tree - an error occurred while copying the gomod-absolutizer tool files: ' + (<any>error).message,
                    'ERR'
                );
            }
        });
        return goModAbsDir;
    }

    /**
     * This function walks over the source directory, and copies all go.mod and *.go files to the target directory.
     * For all go.mod files, it replaces relative paths with absolute.
     * That functionality is needed, so that we can calculate the go dependencies tree on a copy of the original code project,
     * rather than on the original one, in order to avoid changing it.
     * @param sourceDir - Source directory to walk through.
     * @param targetDir - Target directory to copy relevant files to.
     * @param goModAbsDir - Path to the location of the gomod-absolutizer tool.
     */
    public static prepareProjectWorkspace(
        sourceDir: string,
        targetDir: string,
        goModAbsDir: string,
        logManager: LogManager,
        executeCmdFunction: (goModPath: string, sourceDir: string, goModAbsDir: string) => void
    ) {
        logManager.logMessage('Copy go workspace from' + sourceDir + ', to' + targetDir, 'DEBUG');
        walkdir.find(sourceDir, { follow_symlinks: false, sync: true }, function(curPath: string, stat: fs.Stats) {
            let destPath: string = path.resolve(targetDir, path.relative(sourceDir, curPath));

            if (stat.isDirectory()) {
                if (GoUtils.shouldSkipDirectory(curPath, '.git', '.idea', '.vscode')) {
                    this.ignore(curPath);
                    return;
                }
                if (curPath !== sourceDir) {
                    // Skip subdirectories with go.mod files.
                    // These directories are different Go projects and their go files should not be in the root project.
                    let files: string[] = fs.readdirSync(curPath).filter(fn => fn === 'go.mod');
                    if (files.length > 0) {
                        // Ignore the subdirectory for the rest of the walk.
                        this.ignore(curPath);
                        return;
                    }
                }

                // Root dir, or dir without go.mod - create the directory in target.
                Utils.createDirIfNotExists(destPath);
                return;
            }

            logManager.logMessage('Copying ' + curPath + ' to ' + destPath, 'DEBUG');
            fs.copySync(curPath, destPath);

            // The root go.mod file is copied and relative path in "replace" are resolved to absolute paths.
            if (path.basename(curPath) === 'go.mod') {
                executeCmdFunction(destPath, sourceDir, goModAbsDir);
                return;
            }
        });
    }
    private static shouldSkipDirectory(dirPath: string, ...dirToIgnore: string[]) {
        for (let dir of dirToIgnore) {
            if (dirPath.includes(path.sep + dir)) {
                return true;
            }
        }
        return false;
    }
}
