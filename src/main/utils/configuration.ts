import * as vscode from 'vscode';
import { LogLevel } from '../log/logManager';
export class Configuration {
    public static jfrogSectionConfigurationKey: string = 'jfrog';

    /**
     * Get scan exclude pattern. This pattern is used to exclude specific file descriptors (go.mod, package.json, etc.) from being scanned by Xray.
     * Descriptor files which are under a directory which matches the pattern will not be scanned.
     * @param workspaceFolder - The workspace folder
     */
    public static getScanExcludePattern(workspaceFolder?: vscode.WorkspaceFolder): string | undefined {
        let resource: vscode.Uri | null = workspaceFolder ? workspaceFolder.uri : null;
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey, resource).get('xray.exclusions');
    }

    /**
     * Return true if should watch for changes in go.sum or package-lock.json files.
     */
    public static isWatchEnabled(): boolean | undefined {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('xray.watchers');
    }

    /**
     * Return true if exclude dev dependencies option is checked on the jfrog extension configuration page.
     */
    public static excludeDevDependencies(): boolean | undefined {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('excludeDevDependencies');
    }

    public static getBuildsPattern(): string {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('xray.ciIntegration.buildNamePattern') || '';
    }

    /**
     * @returns JFrog project Key
     */
    public static getProjectKey(): string {
        return vscode.workspace
            .getConfiguration(this.jfrogSectionConfigurationKey)
            .get('projectKey', '')
            .trim();
    }

    /**
     * @returns Xray Watches
     */
    public static getWatches(): string[] {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('watches', []);
    }

    /**
     * @returns the log level
     */
    public static getLogLevel(): LogLevel {
        return vscode.workspace
            .getConfiguration(this.jfrogSectionConfigurationKey)
            .get('logLevel', 'info')
            .toUpperCase() as LogLevel;
    }

    /**
     * @returns the number of connection retries
     */
    public static getConnectionRetries(): number {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('connectionRetries', 3);
    }

    /**
     * @returns the number of connection retries
     */
    public static getConnectionTimeout(): number {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('connectionTimeout', 10000);
    }

    /**
     * @returns the encoded proxy authorization if exists
     */
    public static getProxyAuth(): string | undefined {
        return vscode.workspace.getConfiguration().get('http.proxyAuthorization');
    }
}
