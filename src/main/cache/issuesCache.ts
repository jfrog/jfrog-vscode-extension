// import path from 'path';
import { IGraphResponse } from 'jfrog-client-js';
import { IImpactedPath } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
// import { ScanUtils } from '../utils/scanUtils';
// storage
// issue cache saves per workspace the scans and the last time it was scanned completed

export interface WorkspaceIssuesData {
    path: string;
    descriptorsIssuesData: DescriptorIssuesData[];
    failedFiles: FileIssuesData[];
}

export interface FileIssuesData {
    name: string;
    fullpath: string;
}

export interface DescriptorIssuesData extends FileIssuesData {
    graphScanTimestamp: number;
    dependenciesGraphScan: IGraphResponse; // holds issue data and the dependecies with those issues.
    convertedImpact: { [issue_id: string]: IImpactedPath }; // holds the impact path of each issue from descriptor to the dependecy with it entries of map: issue_id -> impact_path
}

export class IssuesCache {
    // private static readonly CACHE_BASE_PATH: string = path.resolve(ScanUtils.getHomePath(), 'issues-cache');
    public static readonly CACHE_BASE_KEY: string = 'jfrog.xray.cache.issues.';
    // private readonly cacheDir: string;

    constructor(public _cache: vscode.Memento) {}

    static toKey(workSpace: vscode.WorkspaceFolder): string {
        return IssuesCache.CACHE_BASE_KEY + workSpace.uri.fsPath;
    }

    static dataToJSON(val: WorkspaceIssuesData): string {
        // val.descriptorsIssuesData.forEach(descriptor => {
        //     descriptor.convertedImpact = Object.fromEntries(descriptor.impactedPaths.entries());
        // });
        return JSON.stringify(val);
        // return JSON.stringify(val, (key, v) => {
        //     if (key == "impactedPaths" && val !== null) {
        //         return Array.from(v.entries());
        //     } else {
        //         return v;
        //     }
        // });
    }

    static jsonToData(raw: string): WorkspaceIssuesData {
        // let value: WorkspaceIssuesData = JSON.parse(raw);
        // value.descriptorsIssuesData.forEach(descriptor => {
        //     descriptor.impactedPaths = new Map<string, IImpactedPath>(Object.entries(descriptor.convertedImpact));
        // });
        return JSON.parse(raw);
        // return JSON.parse(value, (key, val) => {
        //     if (key == "impactedPaths" && val !== null) {
        //         return new Map<string, IImpactedPath>(Object.entries(val.value));
        //     }
        //     return value;
        // });
    }

    contains(workSpace: vscode.WorkspaceFolder): boolean {
        return !this._cache.keys().find(key => key == IssuesCache.toKey(workSpace));
    }

    get(workSpace: vscode.WorkspaceFolder): WorkspaceIssuesData | undefined {
        let rawData: string | undefined = this._cache.get(IssuesCache.toKey(workSpace));
        if (rawData) {
            return IssuesCache.jsonToData(rawData);
        }
        return undefined;
    }

    store(workSpace: vscode.WorkspaceFolder, value: WorkspaceIssuesData) {
        return this._cache.update(IssuesCache.toKey(workSpace), IssuesCache.dataToJSON(value));
    }

    remove(workSpace: vscode.WorkspaceFolder) {
        return this._cache.update(IssuesCache.toKey(workSpace), undefined);
    }
}
