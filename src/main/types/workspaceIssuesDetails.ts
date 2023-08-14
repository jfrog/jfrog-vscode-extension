import { IGraphResponse } from 'jfrog-client-js';
import { IImpactGraph } from 'jfrog-ide-webview';
import { ApplicabilityScanResponse } from '../scanLogic/scanRunners/applicabilityScan';
import { EosScanResponse } from '../scanLogic/scanRunners/eosScan';
import { Utils } from '../utils/utils';
import { PackageType } from './projectType';
import { IacScanResponse } from '../scanLogic/scanRunners/iacScan';
import { SecretsScanResponse } from '../scanLogic/scanRunners/secretsScan';

/**
 * Describes all the issue data for a specific workspace from Xray scan
 */
export class ScanResults {
    private _descriptorsIssues: DependencyScanResults[] = [];
    private _eosScan: EosScanResponse = {} as EosScanResponse;
    private _eosScanTimestamp?: number;
    private _iacScan: IacScanResponse = {} as IacScanResponse;
    private _iacScanTimestamp?: number;
    private _secretsScan: SecretsScanResponse = {} as SecretsScanResponse;
    private _secretsScanTimestamp?: number;
    private _failedFiles: EntryIssuesData[] = [];

    constructor(private _path: string) {}

    public static fromJson(jsonScanResults: any) {
        const workspaceIssuesDetails: ScanResults = new ScanResults(jsonScanResults._path);
        if (jsonScanResults._descriptorsIssues) {
            workspaceIssuesDetails.descriptorsIssues.push(...jsonScanResults._descriptorsIssues);
        }
        // Eos
        workspaceIssuesDetails.eosScan = jsonScanResults._eosScan;
        workspaceIssuesDetails.eosScanTimestamp = jsonScanResults._eosScanTimestamp;
        // Iac
        workspaceIssuesDetails.iacScan = jsonScanResults._iacScan;
        workspaceIssuesDetails.iacScanTimestamp = jsonScanResults._iacScanTimestamp;
        // Secrets
        workspaceIssuesDetails.secretsScan = jsonScanResults._secretsScan;
        workspaceIssuesDetails.secretsScanTimestamp = jsonScanResults._secretsScanTimestamp;
        if (jsonScanResults._failedFiles) {
            workspaceIssuesDetails.failedFiles.push(...jsonScanResults._failedFiles);
        }
        return workspaceIssuesDetails;
    }

    /**
     * Get the oldest timestamp from all its results
     */
    public get oldestScanTimestamp(): number | undefined {
        return Utils.getOldestTimeStamp(
            ...this._descriptorsIssues.map(descriptorIssues => descriptorIssues.graphScanTimestamp),
            ...this._descriptorsIssues.map(descriptorIssues => descriptorIssues.applicableScanTimestamp),
            this.iacScanTimestamp,
            this.secretsScanTimestamp,
            this.eosScanTimestamp
        );
    }

    /**
     * Check if the data has at least one issue
     * @returns true if at least one issue exists
     */
    public hasIssues(): boolean {
        return (
            this.descriptorsIssues.length > 0 ||
            this.eosScan?.filesWithIssues?.length > 0 ||
            this.iacScan?.filesWithIssues?.length > 0 ||
            this.secretsScan?.filesWithIssues?.length > 0
        );
    }

    get path(): string {
        return this._path;
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

    get iacScan(): IacScanResponse {
        return this._iacScan;
    }

    set iacScan(value: IacScanResponse) {
        this._iacScan = value;
    }

    get iacScanTimestamp(): number | undefined {
        return this._iacScanTimestamp;
    }

    set iacScanTimestamp(value: number | undefined) {
        this._iacScanTimestamp = value;
    }

    get secretsScan(): SecretsScanResponse {
        return this._secretsScan;
    }

    set secretsScan(value: SecretsScanResponse) {
        this._secretsScan = value;
    }

    get secretsScanTimestamp(): number | undefined {
        return this._secretsScanTimestamp;
    }

    set secretsScanTimestamp(value: number | undefined) {
        this._secretsScanTimestamp = value;
    }

    get failedFiles(): EntryIssuesData[] {
        return this._failedFiles;
    }

    set failedFiles(value: EntryIssuesData[]) {
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
export interface EntryIssuesData {
    name: string;
    fullPath: string;
    isEnvironment: boolean;
}

/**
 * Describes all the issues data for a specific descriptor from Xray scan
 */
export interface DependencyScanResults extends EntryIssuesData {
    type: PackageType;
    graphScanTimestamp: number;
    dependenciesGraphScan: IGraphResponse;
    impactTreeData: { [issue_id: string]: IImpactGraph };
    applicableIssues: ApplicabilityScanResponse;
    applicableScanTimestamp?: number;
}
