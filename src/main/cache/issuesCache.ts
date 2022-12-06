import * as vscode from 'vscode';
// storage
// issue cache saves per workspace the scans and the last time it was scanned completed

export class IssuesCache {

    constructor(
        private _cache: vscode.Memento
    ) {}
    
    static toKey(workSpace: vscode.WorkspaceFolder): string {
        return workSpace.uri.fsPath;
    }

    get<O>(workSpace: vscode.WorkspaceFolder): O/*CacheObject<O>*/ | undefined {
        return this._cache.get(IssuesCache.toKey(workSpace));
    }
    
    store<O>(workSpace: vscode.WorkspaceFolder, value: O): Thenable<void> {
        return this._cache.update(
            IssuesCache.toKey(workSpace),
            value//new CacheObject(Date.now(),value)
            );
    }

    remove(workSpace: vscode.WorkspaceFolder): Thenable<void> {
        return this._cache.update(
            IssuesCache.toKey(workSpace),
            undefined
        );
    }
}

export class CacheObject<O> {
    constructor(
        public readonly updateTimeStamp: number,
        public readonly data: O,
    ){}
}