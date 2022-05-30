import * as exec from 'child_process';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { PackageType } from '../types/projectType';
import { Configuration } from './configuration';

export class ScanUtils {
    public static readonly RESOURCES_DIR: string = ScanUtils.getResourcesDir();
    public static readonly SPAWN_PROCESS_BUFFER_SIZE: number = 104857600;

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
                { base: workspace.uri.fsPath, pattern: '**/{go.mod,pom.xml,package.json,yarn.lock,*.sln,setup.py,requirements*.txt}' },
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

    static readFileIfExists(filePath: string): string | undefined {
        if (fse.pathExistsSync(filePath)) {
            return fse.readFileSync(filePath).toString();
        }
        return undefined;
    }

    static async removeFolder(folderPath: string): Promise<void> {
        if (fse.pathExistsSync(folderPath)) {
            await fse.remove(folderPath);
        }
    }

    public static executeCmd(command: string, cwd?: string): any {
        return exec.execSync(command, { cwd: cwd, maxBuffer: ScanUtils.SPAWN_PROCESS_BUFFER_SIZE });
    }

    public static setScanInProgress(state: boolean) {
        vscode.commands.executeCommand('setContext', 'scanInProgress', state);
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
            return PackageType.GO;
        }
        if (fsPath.endsWith('pom.xml')) {
            return PackageType.MAVEN;
        }
        if (fsPath.endsWith('yarn.lock')) {
            return PackageType.YARN;
        }
        if (fsPath.endsWith('package.json')) {
            if (fs.existsSync(path.join(path.dirname(fsPath), 'yarn.lock'))) {
                // The package type is yarn, but we already saved the fsPath of yarn.lock as the project descriptor
                return undefined;
            }
            return PackageType.NPM;
        }
        if (fsPath.endsWith('.sln')) {
            return PackageType.NUGET;
        }
        return PackageType.PYTHON;
    }

    static createTmpDir(): string {
        return tmp.dirSync({} as tmp.DirOptions).name;
    }
}

export class ScanCancellationError extends Error {
    message: string = 'Xray scan cancelled';
}
