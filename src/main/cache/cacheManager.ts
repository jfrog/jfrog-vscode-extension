import * as vscode from 'vscode';

import { ScanUtils } from '../utils/scanUtils';
import { Utils } from '../utils/utils';
import { ScanResults } from '../types/workspaceIssuesDetails';
import { CacheRecord } from './cacheRecord';

/**
 * Manages caching of workspace issues data in the extension.
 */
export class CacheManager {
    private static readonly CACHE_VERSION: number = 1;
    private static readonly MAX_SCAN_CACHE_AGE_MILLISECS: number = 1000 * 60 * 60 * 24 * 7;
    public static readonly CACHE_BASE_KEY: string = 'jfrog.cache.issues.';
    private _cache: vscode.Memento;

    constructor(context: vscode.ExtensionContext) {
        Utils.createDirIfNotExists(ScanUtils.getHomePath());
        this._cache = context.workspaceState;
    }

    /**
     * Save a workspace issues data in the cache
     * @param workspace - the workspace to store it's data
     * @param value - the data we want to store
     */
    public save(workspace: vscode.WorkspaceFolder, value: ScanResults) {
        const record: CacheRecord = new CacheRecord(value, Date.now(), CacheManager.CACHE_VERSION);
        return this._cache.update(this.toKey(workspace), JSON.stringify(record));
    }

    /**
     * Get the unique key for this workspace
     * @param workspace - the workspace we want to get it's id
     * @returns - the unique key for this workspace
     */
    private toKey(workspace: vscode.WorkspaceFolder): string {
        return CacheManager.CACHE_BASE_KEY + workspace.uri.fsPath;
    }

    /**
     * Get a scan results stored in the cache base on a given workspace and make sure the results are not expired.
     * @param workspace - the workspace to search it's data
     * @returns ScanResults if there are stored and not expired, undefined otherwise.
     */
    public async load(workspace: vscode.WorkspaceFolder): Promise<ScanResults | undefined> {
        let rawJson: string | undefined = this._cache.get(this.toKey(workspace));
        if (rawJson === undefined) {
            // No cache found
            return undefined;
        }
        const record: CacheRecord = CacheRecord.fromJson(rawJson);
        if (this.invalidTimestamp(record.timestamp) || this.invalidCacheVersion(record.version) || !record.data) {
            vscode.window.showInformationMessage('JFrog: Scan results have expired.', ...['Rescan']).then(answer => {
                if (answer === 'Rescan') {
                    vscode.commands.executeCommand('jfrog.scan.refresh');
                }
            });
            return undefined;
        }
        return ScanResults.fromJson(record.data);
    }

    private invalidTimestamp(timestamp?: number): boolean {
        return !timestamp || Date.now() - timestamp > CacheManager.MAX_SCAN_CACHE_AGE_MILLISECS;
    }

    private invalidCacheVersion(version?: number): boolean {
        return version !== CacheManager.CACHE_VERSION;
    }
}
