import * as fs from 'fs';
import { IArtifact, IIssue } from 'jfrog-client-js';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { IIssueKey } from '../types/issueKey';
import { ILicenseCacheObject } from '../types/licenseCacheObject';
import { ILicenseKey } from '../types/licenseKey';
import { INodeInfo } from '../types/nodeInfo';
import { Severity } from '../types/severity';
import { Translators } from '../utils/translators';
import { ScanCacheObject } from './scanCacheObject';
import { IScannedCveObject } from '../types/scannedCveObject';
import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import { CveDetails, ProjectComponents } from '../types/projectComponents';

/**
 * Provide the cache mechanism. The scan cache consists of 3 components -
 * 1. Scan cache - contains general information about components and the IDs of the issues and licenses. This cache stored in the RAM.
 * 2. Issues cache - consists of files. Each file contains information about an Xray issue.
 * 3. Licenses cache - consists of files. Each file contains information about an Xray license.
 *
 * Usage:
 * For each artifact received from the Xray scan:
 * 1. Add a scan cache object, including issue IDs and licenses names.
 * 2. Store all issues in the issues cache. Each issue in a file.
 * 3. Store all licenses in the licenses cache. Each license in a file.
 */
export class ScanCacheManager implements ExtensionComponent {
    private static readonly CACHE_VERSION_KEY: string = 'jfrog.cache.version';
    private static readonly CACHE_VERSION: number = 0;

    private _scanCache!: vscode.Memento;
    private _licensesCache!: string;
    private _issuesCache!: string;
    private _scannedCvesCache!: string;
    private _isOutdated!: boolean;

    public activate(context: vscode.ExtensionContext): ScanCacheManager {
        this._scanCache = context.workspaceState;
        let storageDir: string | undefined = context.storagePath;
        if (!storageDir) {
            return this;
        }
        this._issuesCache = path.join(storageDir, 'issues');
        // CVEs found in the workspace.
        this._scannedCvesCache = path.join(storageDir, 'scanned.cves');
        this._licensesCache = path.join(storageDir, 'licenses');
        if (!fs.existsSync(this._issuesCache)) {
            fs.mkdirSync(this._issuesCache, { recursive: true } as fs.MakeDirectoryOptions);
        }
        if (!fs.existsSync(this._scannedCvesCache)) {
            fs.mkdirSync(this._scannedCvesCache, { recursive: true } as fs.MakeDirectoryOptions);
        }
        if (!fs.existsSync(this._licensesCache)) {
            fs.mkdirSync(this._licensesCache);
        }
        this._isOutdated = this._scanCache.get(ScanCacheManager.CACHE_VERSION_KEY) !== ScanCacheManager.CACHE_VERSION;
        return this;
    }

    /**
     * Get artifact from cache or undefined if absent.
     *
     * @param componentId The component id
     */
    public getScanCacheObject(componentId: string): ScanCacheObject | undefined {
        return this._scanCache.get<ScanCacheObject>(componentId);
    }

    public getNodeInfo(componentId: string): INodeInfo | undefined {
        let scanCacheObject: ScanCacheObject | undefined = this.getScanCacheObject(componentId);
        return scanCacheObject ? scanCacheObject.nodeInfo : undefined;
    }

    // /**
    //  * Stores a list of project's CVEs in the cache.
    //  */
    public storeScannedCves(scannedCveObject: IScannedCveObject) {
        const prevObject: IScannedCveObject | undefined = this.getScannedCves(scannedCveObject.projectPath);
        if (prevObject) {
            for (const [cve, sevirity] of prevObject.cves) {
                scannedCveObject.cves.set(cve, sevirity);
            }
        }
        fs.writeFileSync(
            this.getScannedCvesPath(scannedCveObject.projectPath),
            JSON.stringify(scannedCveObject, (key, value) => {
                if (value instanceof Map) {
                    return {
                        dataType: 'Map',
                        value: Array.from(value.entries())
                    };
                } else {
                    return value;
                }
            })
        );
    }
    // /**
    //  * Generate a uniq local file id for the scanned CVEs for a given project path.
    //  * @param projectPath File path of the scanned CVEs
    //  * @returns hashed project path
    //  */
    private createScannedCvesId(projectPath: string): string {
        return crypto
            .createHash('sha256')
            .update(projectPath)
            .digest('hex');
    }

    // /**
    //  * Delete the old CVE list cache associated with 'projectPath'.
    //  */
    public deleteScannedCves(projectPath: string) {
        let scannedCvesPath: string = this.getScannedCvesPath(projectPath);
        if (fs.existsSync(scannedCvesPath)) {
            fs.rmSync(scannedCvesPath);
        }
    }

    public getScannedCves(projectPath: string): IScannedCveObject | undefined {
        let scannedCvesPath: string = this.getScannedCvesPath(projectPath);
        if (!fs.existsSync(scannedCvesPath)) {
            return undefined;
        }
        let content: string = fs.readFileSync(scannedCvesPath, 'utf8');
        return Object.assign(
            {} as IIssue,
            JSON.parse(content, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                    if (value.dataType === 'Map') {
                        return new Map(value.value);
                    }
                }
                return value;
            })
        );
    }
    public storeIssue(issue: IIssueCacheObject) {
        fs.writeFileSync(this.getIssuePath(issue.issueId), JSON.stringify(issue));
    }

    public getIssue(issueId: string): IIssueCacheObject | undefined {
        let issuePath: string = this.getIssuePath(issueId);
        if (!fs.existsSync(issuePath)) {
            return undefined;
        }
        let content: string = fs.readFileSync(issuePath, 'utf8');
        return Object.assign({} as IIssue, JSON.parse(content));
    }

    public storeLicense(license: ILicenseCacheObject) {
        fs.writeFileSync(this.getLicensePath(license.name), JSON.stringify(license));
    }

    public getLicense(licenseName: string): ILicenseCacheObject | undefined {
        let licensePath: string = this.getLicensePath(licenseName);
        if (!fs.existsSync(licensePath)) {
            return undefined;
        }
        let content: string = fs.readFileSync(licensePath, 'utf8');
        return Object.assign({} as ILicenseCacheObject, JSON.parse(content));
    }

    /**
     * Check if exist in cache and not expired.
     *
     * @param componentId The component id.
     * @returns true if component exist and not expired.
     */
    public isValid(componentId: string): boolean {
        if (this._isOutdated) {
            // Cache is outdated and need to be repopulated
            return false;
        }
        let scanCacheObject: ScanCacheObject | undefined = this.getScanCacheObject(componentId);
        if (!scanCacheObject) {
            // Artifact not exists in cache
            return false;
        }
        return ScanCacheObject.isValid(scanCacheObject);
    }

    public async storeComponents(components: Map<string, INodeInfo>, issues: IIssueCacheObject[], licenses: ILicenseCacheObject[]) {
        for (let issue of issues) {
            this.storeIssue(issue);
        }
        for (let license of licenses) {
            this.storeLicense(license);
        }
        for (let [componentId, nodeInfo] of components) {
            await this._scanCache.update(componentId, new ScanCacheObject(nodeInfo));
        }
        this._isOutdated = false;
        await this._scanCache.update(ScanCacheManager.CACHE_VERSION_KEY, ScanCacheManager.CACHE_VERSION);
    }

    /**
    /  * Store Artifacts (vulnerability data from Xray) in local cache
    /  * @param artifacts - The data to save
    /  * @param componentToCves - A map of componentId (dependency key) -> (Cve, severity)
    /  */
    public async storeArtifacts(artifacts: IArtifact[], componentToCves: ProjectComponents): Promise<void> {
        let scannedComponents: Map<string, INodeInfo> = new Map();
        let issues: IIssueCacheObject[] = [];
        let licenses: ILicenseCacheObject[] = [];
        for (let artifact of artifacts) {
            let nodeInfo: INodeInfo = {
                top_severity: Severity.Normal,
                issues: [] as IIssueKey[],
                licenses: [] as ILicenseKey[]
            } as INodeInfo;
            for (let issue of artifact.issues) {
                let severity: Severity = Translators.toSeverity(issue.severity);
                if (severity > nodeInfo.top_severity) {
                    nodeInfo.top_severity = severity;
                }
                const cacheIssueObject: IIssueCacheObject = Translators.toCacheIssue(issue);
                issues.push(cacheIssueObject);
                // Set each component's CVE
                cacheIssueObject.cves.forEach(cve => {
                    let cveDetails: CveDetails | undefined = componentToCves.componentIdToCve.get(artifact.general.component_id);
                    if (cveDetails === undefined) {
                        cveDetails = { cveToSeverity: new Map() };
                        componentToCves.componentIdToCve.set(artifact.general.component_id, cveDetails);
                    }
                    cveDetails.cveToSeverity.set(cve, cacheIssueObject.severity);
                });
                nodeInfo.issues.push({ issue_id: issue.issue_id, component: artifact.general.component_id } as IIssueKey);
            }
            for (let license of artifact.licenses) {
                licenses.push(Translators.toCacheLicense(license));
                nodeInfo.licenses.push({ licenseName: license.name, violated: false } as ILicenseKey);
            }
            scannedComponents.set(artifact.general.component_id, nodeInfo);
        }
        await this.storeComponents(scannedComponents, issues, licenses);
    }

    /**
     * Return Xray issue ID path in file system.
     * @param issueId - the Xray issue ID e.g. XRAY-12345
     * @returns path to the issue in the file system.
     */
    private getIssuePath(issueId: string): string {
        return path.join(this._issuesCache, issueId);
    }

    /**
     * Get the path to the cache file that contains a list of CVEs found for the given path.
     * @param projectPath - The project path
     */
    private getScannedCvesPath(projectPath: string): string {
        return path.join(this._scannedCvesCache, this.createScannedCvesId(projectPath));
    }

    /**
     * Return license path in file system.
     * The license name may include special characters, for example: "MIT/X11". In these cases, we may want to replace them by "_".
     * @param licenseName - the license name e.g. MIT or Apache-2.0
     * @returns path to the license in file system.
     */
    private getLicensePath(licenseName: string): string {
        return path.join(this._licensesCache, licenseName.replace(/[^a-zA-Z0-9]/g, '_'));
    }
}
