import * as vscode from 'vscode';

export class Configuration {
    /**
     * Get scan exclude pattern. This pattern is used to exclude specific file descriptors (go.mod, package.json, etc.) from being scanned by Xray.
     * Descriptor files which are under a directory which matches the pattern will not be scanned.
     * @param workspaceFolder - The workspace folder
     */
    public static getScanExcludePattern(workspaceFolder?: vscode.WorkspaceFolder): string | undefined {
        let resource: vscode.Uri | null = workspaceFolder ? workspaceFolder.uri : null;
        return vscode.workspace.getConfiguration('jfrog', resource).get('xray.exclusions');
    }

    /**
     * Return true if should watch for changes in go.sum or package-lock.json files.
     */
    public static isWatchEnabled(): boolean | undefined {
        return vscode.workspace.getConfiguration('jfrog').get('xray.watchers');
    }

    public static getBuildsPattern(): string {
        return vscode.workspace.getConfiguration('jfrog').get('xray.ciIntegration.BuildNamePattern') || '';
    }
}
