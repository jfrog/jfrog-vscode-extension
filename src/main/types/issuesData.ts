import { IGraphResponse } from 'jfrog-client-js';
import { IImpactGraph } from 'jfrog-ide-webview';
import { ApplicabilityScanResponse } from '../scanLogic/scanRunners/applicabilityScan';
import { EosScanResponse } from '../scanLogic/scanRunners/eosScan';
import { PackageType } from './projectType';

/**
 * Describes all the issue data for a specific workspace from Xray scan
 */
export class WorkspaceIssuesData {
    public readonly descriptorsIssuesData: DescriptorIssuesData[] = [];
    eosScan: EosScanResponse = {} as EosScanResponse;
    eosScanTimestamp?: number;
    failedFiles: FileIssuesData[] = [];

    constructor(public readonly path: string) {}

    /**
     * Check if the data has at least one issue
     * @returns true if at least one issue exists
     */
    public hasIssues(): boolean {
        return this.descriptorsIssuesData.length > 0 || this.eosScan?.filesWithIssues?.length > 0;
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
    fullpath: string;
}

/**
 * Describes all the issues data for a specific descriptor from Xray scan
 */
export interface DescriptorIssuesData extends FileIssuesData {
    type: PackageType;
    graphScanTimestamp: number;
    dependenciesGraphScan: IGraphResponse;
    impactTreeData: { [issue_id: string]: IImpactGraph };
    applicableIssues: ApplicabilityScanResponse;
    applicableScanTimestamp?: number;
}
