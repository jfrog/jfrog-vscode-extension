import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';

export class Configuration implements ExtensionComponent {
    activate(): Configuration {
        vscode.workspace.onDidChangeConfiguration(changeEvent => {
            if (changeEvent.affectsConfiguration('jfrog')) {
                // Validate
                try {
                    Configuration.validateExcludeString(vscode.workspace.getConfiguration('jfrog').get('xray.exclusions'));
                } catch (err) {
                    vscode.window.showErrorMessage((<Error>err).message);
                }
            }
        });
        return this;
    }

    private static EXCLUDE_PATTERN: RegExp = /^(\*\*\/\*({.*,?})\*|\*\*\/\*(.+)\*)$/;
    public static PATTERN_NOT_MATCH: string = 'Exclude pattern must be in the following pattern: **/*{option-1,option-2,...option-10}*';
    public static BRACKET_ERROR: string = "Exclude pattern can't contain more than one curly brackets pair";

    /**
     * Validate if the exclude pattern is legal:
     * 1. contains up to one pair of {}
     * 2. matches the following pattern: ^(.*\/\*({.*,?})\*|.*\/\*(.*)\*)$
     * Or throw error if not legal.
     * @param excludePattern - the pattern to validate
     */
    public static validateExcludeString(excludePattern?: string) {
        if (excludePattern) {
            if ((excludePattern.split('{') || []).length > 2 && (excludePattern.split('}') || []).length > 2) {
                throw new Error(Configuration.BRACKET_ERROR);
            }
            if (!Configuration.EXCLUDE_PATTERN.test(excludePattern)) {
                throw new Error(Configuration.PATTERN_NOT_MATCH);
            }
        }
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

    /**
     * Return true if should watch for changes in go.sum or package-lock.json files.
     */
    public static isWatchEnabled(): boolean | undefined {
        return vscode.workspace.getConfiguration('jfrog').get('xray.watchers');
    }

    public static getBuildsPattern(): string {
        return vscode.workspace.getConfiguration('jfrog').get('xray.ciIntegration.buildNamePattern') || '';
    }

    /**
     * @returns JFrog project Key
     */
    public static getProjectKey(): string {
        return vscode.workspace
            .getConfiguration('jfrog')
            .get('projectKey', '')
            .trim();
    }

    /**
     * @returns Xray Watches
     */
    public static getWatches(): string[] {
        return vscode.workspace.getConfiguration('jfrog').get('watches', []);
    }

    /**
     * @returns the log level
     */
    public static getLogLevel(): string {
        return vscode.workspace.getConfiguration('jfrog').get('logLevel', 'info');
    }

    /**
     * @returns the number of connection retries
     */
    public static getConnectionRetries(): number {
        return vscode.workspace.getConfiguration('jfrog').get('connectionRetries', 3);
    }
}
