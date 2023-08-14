import * as vscode from 'vscode';

import { ScanUtils } from '../utils/scanUtils';
import { Utils } from '../utils/utils';
import { ScanResults } from '../types/workspaceIssuesDetails';
import { CacheRecord } from './cacheRecord';

/**
 * Manages caching of workspace issues data in the extension.
 */
export class CacheManager {
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
        const record: CacheRecord = new CacheRecord(value, Date.now(), CacheRecord.CURRENT_CACHE_VERSION);
        return this._cache.update(this.toCacheKey(workspace), JSON.stringify(record));
    }

    /**
     * Get the unique key for this workspace
     * @param workspace - the workspace we want to get it's id
     * @returns - the unique key for this workspace
     */
    private toCacheKey(workspace: vscode.WorkspaceFolder): string {
        return CacheManager.CACHE_BASE_KEY + workspace.uri.fsPath;
    }

    /**
     * Retrieve stored scan results from the cache for a given workspace, ensuring they not expired.
     * @param workspace - the workspace for which to retrieve the data.
     * @returns ScanResults if they are stored, not expired, or have the latest cache version
     */
    public async load(workspace: vscode.WorkspaceFolder): Promise<ScanResults | undefined> {
        let rawJson: string | undefined = this._cache.get(this.toCacheKey(workspace));
        return this.toScanResult(rawJson);
    }

    private toScanResult(rawJson: string | undefined): ScanResults | undefined {
        const record: CacheRecord = CacheRecord.fromJson(rawJson);
        if (record.isEmpty()) {
            return
        }
        if (!record.isNotExpired()) {
            vscode.window.showInformationMessage('JFrog: Scan results have expired.', ...['Rescan']).then(answer => {
                if (answer === 'Rescan') {
                    vscode.commands.executeCommand('jfrog.scan.refresh');
                }
            });
            return;
        }

        return ScanResults.fromJson(record.data);
    }
}
