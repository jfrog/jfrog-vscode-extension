import * as vscode from 'vscode';

import { ExtensionComponent } from '../extensionComponent';
import { IssuesCache } from './issuesCache';
import { ScanUtils } from '../utils/scanUtils';
import { Utils } from '../utils/utils';
import { LogManager } from '../log/logManager';

/**
 * Manage all the caches in the extension
 */
export class CacheManager implements ExtensionComponent {
    private _cache: vscode.Memento | undefined;
    private _issuesCache: IssuesCache | undefined;

    constructor(private _logManager: LogManager) {}

    public activate(context: vscode.ExtensionContext): CacheManager {
        Utils.createDirIfNotExists(ScanUtils.getHomePath());
        // Set caches
        this._cache = context.workspaceState;
        this._issuesCache = new IssuesCache(context.workspaceState, this._logManager);
        return this;
    }

    public get cache(): vscode.Memento | undefined {
        return this._cache;
    }

    public get issuesCache(): IssuesCache | undefined {
        return this._issuesCache;
    }
}
