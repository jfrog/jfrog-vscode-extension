import * as vscode from 'vscode';
import * as fs from 'fs';
import { LogLevel, LogManager } from '../log/logManager';
export class Configuration {
    public static jfrogSectionConfigurationKey: string = 'jfrog';
    public static readonly JFROG_IDE_RELEASES_REPO_ENV: string = 'JFROG_IDE_RELEASES_REPO';

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
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('view.ciIntegration.buildNamePattern') || '';
    }

    public static getExternalResourcesRepository(): string {
        return (
            vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('externalResourcesRepository') ||
            process.env[Configuration.JFROG_IDE_RELEASES_REPO_ENV] ||
            ''
        );
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

    public static getReportAnalytics(): boolean {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('reportAnalytics', true);
    }

    public static getShouldShowJasLogs(): boolean {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('showAdvanceScanLog', false);
    }

    public static getAnalyzerManagerVersion(): string {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('useSpecificScannersVersion', '');
    }

    public static getSastCustomRulesPath(logManager?: LogManager): string {
        let customRulesPath: string = vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('customRulesPath', '');
        if (customRulesPath === '') {
            return '';
        }
        let fileExists: boolean = fs.existsSync(customRulesPath);
        if (!fileExists) {
            if (logManager) {
                logManager.logMessage('Custom rules file not found: ' + customRulesPath, 'WARN');
            }
            return '';
        }
        if (logManager) {
            logManager.logMessage('Using custom rules from: ' + customRulesPath, 'DEBUG');
        }
        return customRulesPath;
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
     * @returns timeout in milliseconds
     */
    public static getConnectionTimeout(): number {
        return vscode.workspace.getConfiguration(this.jfrogSectionConfigurationKey).get('connectionTimeout', 60) * 1000;
    }

    /**
     * @returns the encoded proxy authorization if exists
     */
    public static getProxyAuth(): string | undefined {
        return vscode.workspace.getConfiguration().get('http.proxyAuthorization');
    }
}
