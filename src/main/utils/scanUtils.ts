import * as exec from 'child_process';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import { LogManager } from '../log/logManager';
import { PackageType } from '../types/projectType';
import { Configuration } from './configuration';
import { ContextKeys } from '../constants/contextKeys';
import * as util from 'util';
import AdmZip, { IZipEntry } from 'adm-zip';
export class ScanUtils {
    public static readonly RESOURCES_DIR: string = ScanUtils.getResourcesDir();
    public static readonly SPAWN_PROCESS_BUFFER_SIZE: number = 104857600;

    private static readonly MAX_FILES_EXTRACTED_ZIP: number = 1000;
    private static readonly MAX_SIZE_EXTRACTED_ZIP: number = 1000000000; // 1 GB
    private static readonly COMPRESSION_THRESHOLD_RATIO: number = 100;

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

    public static async backgroundTask(
        scanCbk: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>,
        title: string = ''
    ) {
        title = 'JFrog: ' + title;
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
                    pattern: '**/{go.mod,pom.xml,package.json,yarn.lock,*.sln,setup.py,requirements*.txt}'
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

    public static async executeCmdAsync(command: string, cwd?: string, env?: NodeJS.ProcessEnv | undefined): Promise<any> {
        return await util.promisify(exec.exec)(command, { cwd: cwd, maxBuffer: ScanUtils.SPAWN_PROCESS_BUFFER_SIZE, env: env });
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
    private static extractDescriptorTypeFromPath(fsPath: string): PackageType | undefined {
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
        if (fsPath.endsWith('.sln')) {
            return PackageType.Nuget;
        }
        return PackageType.Python;
    }

    static createTmpDir(): string {
        return tmp.dirSync({} as tmp.DirOptions).name;
    }

    /**
     * @param algorithm - The hash's algorithm to use
     * @param data - The data to hash
     * @returns hashed data in Hex
     */
    static Hash(algorithm: string, data: string): string {
        return crypto
            .createHash(algorithm)
            .update(data)
            .digest('hex');
    }

    static saveAsZip(zipPath: string, ...files: { fileName: string; content: string }[]): void {
        let zip: AdmZip = new AdmZip();
        for (let file of files) {
            zip.addFile(file.fileName, Buffer.alloc(file.content.length, file.content));
        }
        zip.writeZip(zipPath);
    }

    static extractZip(zipPath: string, targetDir: string, overwrite: boolean = true, keepOriginalPermission: boolean = true): any {
        if (!fs.existsSync(zipPath)) {
            return '';
        }
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        let zip: AdmZip = new AdmZip(zipPath);
        let fileCount: number = 0;
        let totalSize: number = 0;

        zip.getEntries().forEach(entry => {
            // Protect against zip bomb
            fileCount++;
            if (fileCount > ScanUtils.MAX_FILES_EXTRACTED_ZIP) {
                throw new ZipExtractError(zipPath, 'Reached max files allowed');
            }

            let entrySize: number = entry.getData().length;
            totalSize += entrySize;
            if (totalSize > ScanUtils.MAX_SIZE_EXTRACTED_ZIP) {
                throw new ZipExtractError(zipPath, 'Reached max size allowed');
            }

            let compressionRatio: number = entrySize / entry.header.compressedSize;
            if (compressionRatio > ScanUtils.COMPRESSION_THRESHOLD_RATIO) {
                throw new ZipExtractError(zipPath, 'Reached max compression ratio allowed');
            }

            if (entry.isDirectory) {
                return;
            }

            if (!zip.extractEntryTo(entry, targetDir, true, overwrite, keepOriginalPermission)) {
                throw new ZipExtractError(zipPath, "can't extract entry " + entry.entryName);
            }
        });
    }

    static extractZipEntry(zipPath: string, name: string): any {
        if (!fs.existsSync(zipPath)) {
            return '';
        }
        let zip: AdmZip = new AdmZip(zipPath);

        let entry: IZipEntry | null = zip.getEntry(name);
        if (!entry) {
            throw new ZipExtractError(zipPath, 'Could not find expected content ' + name);
        }
        return entry.getData().toString('utf8');
    }
}

export class ZipExtractError extends Error {
    constructor(public readonly zipPath: string, reason: string) {
        super('Zip extraction error: ' + reason + ' in zip ' + zipPath);
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
