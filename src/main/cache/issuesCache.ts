import * as vscode from 'vscode';
import { IGraphResponse } from 'jfrog-client-js';
import { IImpactedPath } from 'jfrog-ide-webview';
import { PackageType } from '../types/projectType';
import { ApplicabilityScanResponse } from '../scanLogic/scanRunners/applicabilityScan';

/**
 * Describes all the issue data for a specific workspace from Xray scan
 */
export interface WorkspaceIssuesData {
    path: string;
    descriptorsIssuesData: DescriptorIssuesData[];
    failedFiles: FileIssuesData[];
}
/**
 * Describes all the issue data for a specific file from Xray scan
 */
export interface FileIssuesData {
    name: string;
    fullpath: string;
}
/**
 * Describes all the issues data for a specific descriptor from Xray scan
 */
export interface DescriptorIssuesData extends FileIssuesData {
    type: PackageType;
    graphScanTimestamp: number;
    dependenciesGraphScan: IGraphResponse;
    impactTreeData: { [issue_id: string]: IImpactedPath };
    applicableIssues?: ApplicabilityScanResponse;
    applicableScanTimestamp?: number;
}

/**
 * Describes a cache that holds all the information from an Xray scan for a workspace
 */
export class IssuesCache {
    public static readonly CACHE_BASE_KEY: string = 'jfrog.cache.issues.';

    constructor(public _cache: vscode.Memento) {}

    public static hasIssues(data: WorkspaceIssuesData): boolean {
        return data.descriptorsIssuesData.length > 0;
    }

    public static hasInformation(data: WorkspaceIssuesData): boolean {
        return IssuesCache.hasIssues(data) || data.failedFiles.length > 0;
    }

    /**
     * Get the unique key for this workspace
     * @param workspace - the workspace we want to get it's id
     * @returns - the unique key for this workspace
     */
    public static toKey(workspace: vscode.WorkspaceFolder): string {
        return IssuesCache.CACHE_BASE_KEY + workspace.uri.fsPath;
    }

    /**
     * Check if the cache contains data for a given workspace
     * @param workspace - the workspace to search in the cache
     * @returns - true if exists in cache, false otherwise
     */
    public contains(workspace: vscode.WorkspaceFolder): boolean {
        return !this._cache.keys().find(key => key == IssuesCache.toKey(workspace));
    }

    /**
     * Get the workspace issues data that is stored in the cache base on a given workspace
     * @param workspace - the workspace to search it's data
     * @returns WorkspaceIssuesData if exists in cache, false otherwise.
     */
    public get(workspace: vscode.WorkspaceFolder): WorkspaceIssuesData | undefined {
        let rawData: string | undefined = this._cache.get(IssuesCache.toKey(workspace));
        if (rawData) {
            return JSON.parse(rawData);
        }
        return undefined;
    }

    /**
     * Store a workspace issues data in the cache
     * @param workspace - the workspace to store it's data
     * @param value - the data we want to store
     */
    public store(workspace: vscode.WorkspaceFolder, value: WorkspaceIssuesData) {
        return this._cache.update(IssuesCache.toKey(workspace), JSON.stringify(value));
    }

    /**
     * Remove issues data of workspcae from cache
     * @param workspace - the workspace to delete it's data
     */
    public remove(workspace: vscode.WorkspaceFolder) {
        return this._cache.update(IssuesCache.toKey(workspace), undefined);
    }
}
