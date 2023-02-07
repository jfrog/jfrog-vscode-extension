import * as vscode from 'vscode';
import * as fs from 'fs';

import { ExtensionComponent } from '../extensionComponent';
import { IssuesCache } from './issuesCache';
import { ScanUtils } from '../utils/scanUtils';

/**
 * Manage all the caches in the extension
 */
export class CacheManager implements ExtensionComponent {
    private _cache: vscode.Memento | undefined;
    private _issuesCache: IssuesCache | undefined;

    public activate(context: vscode.ExtensionContext): CacheManager {
        // Create extension folder if not exists
        let homeDir: string = ScanUtils.getHomePath();
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }
        // Create issues folder if not exists
        let issuesDir: string = ScanUtils.getIssuesPath();
        if (!fs.existsSync(issuesDir)) {
            fs.mkdirSync(issuesDir, { recursive: true });
        }
        // Set caches
        this._cache = context.workspaceState;
        this._issuesCache = new IssuesCache(context.workspaceState);
        return this;
    }

    public get cache(): vscode.Memento | undefined {
        return this._cache;
    }

    public get issuesCache(): IssuesCache | undefined {
        return this._issuesCache;
    }
}
