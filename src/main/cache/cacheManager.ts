import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// holds build cache and issueCache
// handles of clean up, making the folders, access to the cache objects

import { ExtensionComponent } from "../extensionComponent";
import { LogManager } from '../log/logManager';
import { IssuesCache } from './issuesCache';


export class CacheManager implements ExtensionComponent {

    private static readonly CACHE_DIR: string = 'jfrog.cache';
    private _cache: vscode.Memento | undefined;
    private _issuesCache: IssuesCache | undefined;
    
    // private storageDir!: string ;
    constructor(private workspaceFolders: vscode.WorkspaceFolder[],private logManager: LogManager) {}

    public activate(context: vscode.ExtensionContext): CacheManager {

        let storageDir: string | undefined = context.storagePath;
        let containDir: boolean = false;
        let cacheDir: string | undefined;
        let containCacheDir: boolean = false;
        if(storageDir) {
            containDir = fs.existsSync(storageDir);
            cacheDir = path.join(storageDir, CacheManager.CACHE_DIR);
            containCacheDir = fs.existsSync(storageDir);
            // storageDir += path.join(storageDir, CacheManager.CACHE_VERSION_KEY);
        //     //fs.mkdirSync(storageDir, { recursive: true } as fs.MakeDirectoryOptions);
        }
        this.logManager.logMessage("<ASSAF> CacheManager activate [#workingSpace= " + this.workspaceFolders.length +"], [storageDir: " + storageDir + " exists: " + containDir+"], [cacheDir: " + cacheDir + " exists: " + containCacheDir + "}" ,'DEBUG');

        // let contextMomento: vscode.Memento = context.workspaceState;
        // this._cache = context.workspaceState;

        // this._issuesCache = new IssuesCache(context.workspaceState);
        
        // for (let i: number = 0; i < 2; i++) {
        //     this.workspaceFolders.forEach(workspace => {
        //         let workspaceKey: string = workspace.uri.fsPath;
        //         let containKey: boolean = contextMomento.keys().filter(key => key == workspaceKey).length > 0;
    
        //         this.logManager.logMessage("<ASSAF> contextMomento contains key '"+workspaceKey+"': " + containKey,'DEBUG');

        //         // contextMomento.update(workspaceKey,1); // store
        //         // contextMomento.update(workspaceKey,undefined); // delete or nothing if not exists
        //     });
        // }

        return this;
    }

    public get cache(): vscode.Memento | undefined {
        return this._cache;
    }

    public get issuesCache(): IssuesCache | undefined {
        return this._issuesCache;
    }

    // Delete any cache from that is older than one week.
    // private cleanupCacheDir(): string {
    //     const files: string[] = fs.readdirSync(storageDir);
    //     files.forEach(file => {
    //         const absFilePath: string = path.join(this._projectCvesCache, file);
    //         if (Date.now() - fs.statSync(absFilePath).birthtimeMs > ScanCacheManager.ONE_WEEK_IN_MILLISECOND) {
    //             fs.rmSync(absFilePath);
    //         }
    //     });
    //     return this._projectCvesCache;
    // }

    // private store(key: string, element: string) {

    // }

    // private delete(key: string) {
        
    // }

    // private has(key: string): boolean {

    // }

}