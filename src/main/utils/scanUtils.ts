import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fse from 'fs-extra';
import * as exec from 'child_process';

export class ScanUtils {
    public static readonly SPAWN_PROCESS_BUFFER_SIZE: number = 104857600;

    public static async scanWithProgress(
        scanCbk: (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => Promise<void>,
        title: string
    ) {
        await vscode.window.withProgress(
            <vscode.ProgressOptions>{
                location: vscode.ProgressLocation.Notification,
                title: title,
                cancellable: true
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => {
                await scanCbk(progress, () => ScanUtils.checkCanceled(token));
            }
        );
    }

    private static checkCanceled(token: vscode.CancellationToken) {
        if (token.isCancellationRequested) {
            throw new Error('Xray Scan cancelled');
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
        if (fse.pathExists(folderPath)) {
            await fse.remove(folderPath);
        }
    }

    public static executeCmd(command: string, cwd?: string): any {
        return exec.execSync(command, { cwd: cwd, maxBuffer: ScanUtils.SPAWN_PROCESS_BUFFER_SIZE });
    }
}
