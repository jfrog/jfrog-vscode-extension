import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fse from 'fs-extra';

export class ScanUtils {
    public static readonly SPAWN_PROCESS_BUFFER_SIZE: number = 104857600;

    public static async scanWithProgress(
        scanCbk: (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => void
    ) {
        await vscode.window.withProgress(
            <vscode.ProgressOptions>{
                location: vscode.ProgressLocation.Notification,
                title: 'Xray Scanning',
                cancellable: true
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => {
                scanCbk(progress, () => ScanUtils.checkCanceled(token));
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

    /**
     * Get scan exclude pattern. This pattern is used to exclude specific file descriptors (go.mod, package.json, etc.) from being scanned by Xray.
     * Descriptor files which are under a directory which matches the pattern will not be scanned.
     * @param workspaceFolder - The workspace folder
     */
    public static getScanExcludePattern(workspaceFolder?: vscode.WorkspaceFolder): string | undefined {
        let resource: vscode.Uri | null = workspaceFolder ? workspaceFolder.uri : null;
        return vscode.workspace.getConfiguration('jfrog', resource).get('xray.exclusions');
    }

    static readFileIfExists(filePase: string): string | undefined {
        if (fse.pathExistsSync(filePase)) {
            return fse.readFileSync(filePase).toString();
        }
        return undefined;
    }

    static async removeFolder(filePase: string): Promise<void> {
        if (fse.pathExists(filePase)) {
            await fse.remove(filePase);
        }
    }
}
