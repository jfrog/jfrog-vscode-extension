import * as exec from 'child_process';
import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { ContextKeys } from '../constants/contextKeys';
import { LogManager } from '../log/logManager';
import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../treeDataProviders/issuesTree/issuesRootTreeNode';
import { PackageType } from '../types/projectType';
import { EntryIssuesData, ScanResults } from '../types/workspaceIssuesDetails';
import { Configuration } from './configuration';

export class ScanUtils {
    public static readonly DESCRIPTOR_SELECTOR_PATTERN: string =
        '**/{go.mod,package.json,pom.xml,setup.py,*requirements*.txt,yarn.lock,*.csproj,*.sln,packages.config}';

    public static readonly RESOURCES_DIR: string = ScanUtils.getResourcesDir();
    public static readonly SPAWN_PROCESS_BUFFER_SIZE: number = 104857600;
    // every 0.1 sec
    private static readonly CANCELLATION_CHECK_INTERVAL_MS: number = 100;

    public static async scanWithProgress(
        scanCbk: (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => Promise<void>,
        title: string,
        quickScan?: boolean
    ) {
        if (quickScan) {
            title = 'JFrog: ' + title;
        }
        await vscode.window.withProgress(
            <vscode.ProgressOptions>{
                // Start progress in balloon only if the user initiated a full scan by clicking on the "Refresh" button.
                // Otherwise - show the progress in the status bar.
                location: quickScan ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification,
                title: title,
                cancellable: true
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => {
                await scanCbk(progress, () => ScanUtils.checkCanceled(token));
            }
        );
    }

    /**
     * Start a background task (not cancelable) with progress in the status bar.
     * the text that will be displayed in the status bar will be: 'JFrog: <TITLE> <Progress.message>
     * @param scanCbk - task callback to execute in the background
     * @param title - the given task title that will be displayed in the status bar, a 'JFrog: ' prefix will be added to it
     */
    public static async backgroundTask(
        scanCbk: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>,
        title: string = ''
    ) {
        title = 'JFrog' + (title ? ': ' + title : '');
        await vscode.window.withProgress(
            <vscode.ProgressOptions>{
                location: vscode.ProgressLocation.Window,
                title: title,
                cancellable: false
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => {
                ScanUtils.checkCanceled(token);
                await scanCbk(progress);
            }
        );
    }

    /**
     * Find go.mod, pom.xml, package.json, *.sln, setup.py, and requirements*.txt files in workspaces.
     * @param workspaceFolders - Base workspace folders to search
     * @param logManager       - Log manager
     */
    public static async locatePackageDescriptors(
        workspaceFolders: vscode.WorkspaceFolder[],
        logManager: LogManager
    ): Promise<Map<PackageType, vscode.Uri[]>> {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = new Map();
        for (let workspace of workspaceFolders) {
            logManager.logMessage('Locating package descriptors in workspace "' + workspace.name + '".', 'INFO');
            let wsPackageDescriptors: vscode.Uri[] = await vscode.workspace.findFiles(
                {
                    baseUri: workspace.uri,
                    base: workspace.uri.fsPath,
                    pattern: ScanUtils.DESCRIPTOR_SELECTOR_PATTERN
                },
                Configuration.getScanExcludePattern(workspace)
            );
            for (let wsPackageDescriptor of wsPackageDescriptors) {
                let type: PackageType | undefined = ScanUtils.extractDescriptorTypeFromPath(wsPackageDescriptor.fsPath);
                if (!type) {
                    continue;
                }
                let uri: vscode.Uri[] | undefined = packageDescriptors.get(type);
                if (!uri) {
                    packageDescriptors.set(type, [wsPackageDescriptor]);
                } else {
                    uri.push(wsPackageDescriptor);
                }
            }
        }
        return packageDescriptors;
    }

    private static checkCanceled(token: vscode.CancellationToken) {
        if (token.isCancellationRequested) {
            throw new ScanCancellationError();
        }
    }

    public static getHomePath(): string {
        return path.join(os.homedir(), '.jfrog-vscode-extension');
    }

    public static getIssuesPath(): string {
        return path.join(ScanUtils.getHomePath(), 'issues');
    }

    public static getLogsPath(): string {
        return path.join(ScanUtils.getIssuesPath(), 'logs');
    }

    static readFileIfExists(filePath: string): string | undefined {
        if (fse.pathExistsSync(filePath)) {
            return fse.readFileSync(filePath).toString();
        }
        return undefined;
    }

    /**
     * Open text editor of a given file.
     * If provided it will also reveal and select a specific region in the file
     * @param filePath - the file to open
     * @param fileRegion - optional region in file to reveal
     */
    public static async openFile(filePath: string, fileRegion?: vscode.Range, viewColumn: vscode.ViewColumn = vscode.ViewColumn.One) {
        if (!filePath) {
            return;
        }
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(filePath);
        let textEditor: vscode.TextEditor = await vscode.window.showTextDocument(textDocument, viewColumn);
        if (!textEditor || !fileRegion) {
            return;
        }
        textEditor.selection = new vscode.Selection(fileRegion.start, fileRegion.end);
        textEditor.revealRange(fileRegion, vscode.TextEditorRevealType.InCenter);
    }

    static async removeFolder(folderPath: string): Promise<void> {
        if (fse.pathExistsSync(folderPath)) {
            await fse.remove(folderPath);
        }
    }

    public static executeCmd(command: string, cwd?: string, env?: NodeJS.ProcessEnv | undefined): any {
        return exec.execSync(command, { cwd: cwd, maxBuffer: ScanUtils.SPAWN_PROCESS_BUFFER_SIZE, env: env });
    }

    public static async executeCmdAsync(
        command: string,
        checkCancel: () => void,
        cwd?: string,
        env?: NodeJS.ProcessEnv | undefined
    ): Promise<exec.ChildProcess> {
        return new Promise<exec.ChildProcess>((resolve, reject) => {
            const childProcess: exec.ChildProcess = exec.exec(command, { cwd: cwd, maxBuffer: ScanUtils.SPAWN_PROCESS_BUFFER_SIZE, env: env });
            const checkCancellationInterval: NodeJS.Timer = setInterval(() => {
                ScanUtils.cancelProcess(childProcess, checkCancellationInterval, checkCancel, reject);
            }, ScanUtils.CANCELLATION_CHECK_INTERVAL_MS);

            childProcess.on('exit', code => {
                clearInterval(checkCancellationInterval);
                code === 0 ? resolve(childProcess) : reject(new Error(`Process exited with code ${code}`));
            });

            childProcess.on('error', err => {
                clearInterval(checkCancellationInterval);
                reject(err);
            });
        });
    }

    public static cancelProcess(
        childProcess: exec.ChildProcess,
        checkCancellationInterval: NodeJS.Timer,
        checkCancel: () => void,
        reject: (reason?: any) => void
    ): void {
        try {
            checkCancel();
        } catch (error) {
            clearInterval(checkCancellationInterval);
            childProcess.kill('SIGTERM');
            reject(error);
        }
    }

    public static setScanInProgress(state: boolean) {
        vscode.commands.executeCommand(ContextKeys.SET_CONTEXT, ContextKeys.SCAN_IN_PROGRESS, state);
    }

    public static setFirstScanForWorkspace(state: boolean) {
        vscode.commands.executeCommand(ContextKeys.SET_CONTEXT, ContextKeys.FIRST_SCAN_STATUS, state);
    }

    private static getResourcesDir(): string {
        let parent: string = path.dirname(__dirname);
        if (parent.endsWith('main')) {
            // In tests, the following path resolved: jfrog-vscode-extension/out/main
            return path.join(parent, '..', '..', 'resources');
        }
        // In production, the following path resolved: jfrog-vscode-extension/dist
        return path.join(parent, 'resources');
    }

    /**
     * Extract PackageType from the input path.
     * @param fsPath - path to package descriptor such as pom.xml, go.mod, etc.
     * @returns PackageType or undefined
     */
    public static extractDescriptorTypeFromPath(fsPath: string): PackageType | undefined {
        if (fsPath.endsWith('go.mod')) {
            return PackageType.Go;
        }
        if (fsPath.endsWith('pom.xml')) {
            return PackageType.Maven;
        }
        if (fsPath.endsWith('yarn.lock')) {
            return PackageType.Yarn;
        }
        if (fsPath.endsWith('package.json')) {
            if (fs.existsSync(path.join(path.dirname(fsPath), 'yarn.lock'))) {
                // The package type is yarn, but we already saved the fsPath of yarn.lock as the project descriptor
                return undefined;
            }
            return PackageType.Npm;
        }
        if (fsPath.endsWith('.sln') || fsPath.endsWith('.csproj') || fsPath.endsWith('packages.config')) {
            return PackageType.Nuget;
        }
        if (fsPath.endsWith('.txt') || fsPath.endsWith('.py')) {
            return PackageType.Python;
        }
        return;
    }

    static createTmpDir(): string {
        return tmp.dirSync({} as tmp.DirOptions).name;
    }

    /**
     * @param algorithm - The hash's algorithm to use
     * @param data - The data to hash
     * @returns hashed data in Hex
     */
    static Hash(algorithm: string, data: crypto.BinaryLike): string {
        return crypto
            .createHash(algorithm)
            .update(data)
            .digest('hex');
    }

    /**
     * Handle errors that occur during workspace scan.
     * If the error is ScanCancellationError it will be thrown.
     * If it is NotEntitledError or handle flag is true it will handle the error by logging and returning undefined.
     * Else the given error will be returned
     * @param error  - the error occurred
     * @param logger - the logManager to log the error in case handle flag is true
     * @param handle - if true the error will be logged and undefined will be returned
     * @returns the error or undefined if it was handled
     */
    public static onScanError(error: Error, logger: LogManager, handle: boolean = false): Error | undefined {
        if (error instanceof ScanCancellationError) {
            throw error;
        }
        if (error instanceof NotEntitledError) {
            logger.logMessage(error.message, 'INFO');
            return undefined;
        }
        if (error instanceof OsNotSupportedError) {
            logger.logMessage(error.message, 'WARN');
            return undefined;
        }
        if (error instanceof NotSupportedError) {
            logger.logMessage(error.message, 'DEBUG');
            return undefined;
        }
        if (handle) {
            logger.logError(error, true);
            return undefined;
        }
        return error;
    }
}

export interface FileScanBundle {
    // The results data of all the scans in the workspace
    workspaceResults: ScanResults;
    // The issues, if exists, found as a result of specific scan
    data: EntryIssuesData;
    // The root view node of the workspace
    rootNode: IssuesRootTreeNode;
    // The view node of the file if exists issues in data
    dataNode?: FileTreeNode;
}

export class NotEntitledError extends Error {
    message: string = 'User is not entitled to run the binary';
}

export class NotSupportedError extends Error {
    constructor(typeNotSupported: string) {
        super(typeNotSupported + ' is not supported in the current Analyzer Manager version');
    }
}

export class OsNotSupportedError extends Error {
    constructor(typeNotSupported: string) {
        super(typeNotSupported + ' is not supported for this operating system');
    }
}

/**
 * Describes an error that occur during file scan.
 * When thrown a new FileTreeNode will be created for the parent the label of the node will be at the given format: {file_name} - {error.reason}
 */
export class FileScanError extends Error {
    constructor(msg: string, public reason: string) {
        super(msg);
    }
}

export class ScanCancellationError extends Error {
    message: string = 'Scan was cancelled';
}
