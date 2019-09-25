import * as vscode from 'vscode';

export class ScanUtils {
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
                await scanCbk(progress, () => ScanUtils.checkCanceled(token));
            }
        );
    }

    private static checkCanceled(token: vscode.CancellationToken) {
        if (token.isCancellationRequested) {
            throw new Error('Xray Scan cancelled');
        }
    }
}
