import { IGraphResponse } from 'jfrog-client-js';
import { IImpactGraph } from 'jfrog-ide-webview';
import { ApplicabilityScanResponse } from '../scanLogic/scanRunners/applicabilityScan';
import { EosScanResponse } from '../scanLogic/scanRunners/eosScan';
import { PackageType } from './projectType';

/**
 * Describes all the issue data for a specific workspace from Xray scan
 */
export class ScanResults {
    private _descriptorsIssues: DependencyScanResults[] = [];
    private _workspaceIssues: DependencyScanResults | undefined;
    private _eosScan: EosScanResponse = {} as EosScanResponse;
    private _eosScanTimestamp?: number;
    private _failedFiles: FileIssuesData[] = [];

    constructor(private _path: string) {}

    public static fromJson(json: string) {
        const tmp: ScanResults = JSON.parse(json);
        const workspaceIssuesDetails: ScanResults = new ScanResults(tmp._path);
        if (tmp._descriptorsIssues) {
            workspaceIssuesDetails.descriptorsIssues.push(...tmp._descriptorsIssues);
        }
        workspaceIssuesDetails.issues = tmp._workspaceIssues;
        workspaceIssuesDetails.eosScan = tmp._eosScan;
        if (tmp._failedFiles) {
            workspaceIssuesDetails.failedFiles.push(...tmp._failedFiles);
        }
        return workspaceIssuesDetails;
    }

    /**
     * Check if the data has at least one issue
     * @returns true if at least one issue exists
     */
    public hasIssues(): boolean {
        return this.descriptorsIssues.length > 0 || this.eosScan?.filesWithIssues?.length > 0 || !!this._workspaceIssues;
    }

    get path(): string {
        return this._path;
    }

    get issues(): DependencyScanResults | undefined {
        return this._workspaceIssues;
    }

    set issues(value: DependencyScanResults | undefined) {
        this._workspaceIssues = value;
    }

    get descriptorsIssues(): DependencyScanResults[] {
        return this._descriptorsIssues;
    }

    set descriptorsIssues(value: DependencyScanResults[]) {
        this._descriptorsIssues = value;
    }

    get eosScan(): EosScanResponse {
        return this._eosScan;
    }

    set eosScan(value: EosScanResponse) {
        this._eosScan = value;
    }

    get eosScanTimestamp(): number | undefined {
        return this._eosScanTimestamp;
    }

    set eosScanTimestamp(value: number | undefined) {
        this._eosScanTimestamp = value;
    }

    get failedFiles(): FileIssuesData[] {
        return this._failedFiles;
    }

    set failedFiles(value: FileIssuesData[]) {
        this._failedFiles = value;
    }

    /**
     * Check if the data has any information (issues + failed) stored in it
     * @returns true if the data has at least one piece of information
     */
    public hasInformation(): boolean {
        return this.hasIssues() || this.failedFiles.length > 0;
    }
}

/**
 * Describes all the issue data for a specific file from Xray scan
 */
export interface FileIssuesData {
    name: string;
    fullPath: string;
}

/**
 * Describes all the issues data for a specific descriptor from Xray scan
 */
export interface DependencyScanResults extends FileIssuesData {
    type: PackageType;
    graphScanTimestamp: number;
    dependenciesGraphScan: IGraphResponse;
    impactTreeData: { [issue_id: string]: IImpactGraph };
    applicableIssues: ApplicabilityScanResponse;
    applicableScanTimestamp?: number;
}
