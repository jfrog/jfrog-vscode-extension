import * as fs from 'fs';
import { IArtifact, IIssue, ILicense } from 'jfrog-client-js';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { Issue } from '../types/issue';
import { License } from '../types/license';
import { INodeInfo } from '../types/nodeInfo';
import { Translators } from '../utils/translators';
import { ScanCacheObject } from './scanCacheObject';

/**
 * Provide the scan results cache in a key-value style map.
 */
export class ScanCacheManager implements ExtensionComponent {
    public static readonly LICENSE_PREFIX: string = 'LICENCE_';

    private _scanCache!: vscode.Memento;
    private _issuesCache!: string;
    private _licensesCache!: string;

    public activate(context: vscode.ExtensionContext): ScanCacheManager {
        this._scanCache = context.workspaceState;
        let storageDir: string | undefined = context.storagePath;
        if (!storageDir) {
            return this;
        }
        this._issuesCache = path.join(storageDir, 'issues');
        this._licensesCache = path.join(storageDir, 'licenses');
        if (!fs.existsSync(this._issuesCache)) {
            fs.mkdirSync(this._issuesCache, { recursive: true } as fs.MakeDirectoryOptions);
        }
        if (!fs.existsSync(this._licensesCache)) {
            fs.mkdirSync(this._licensesCache);
        }
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

    public storeIssue(issue: IIssue) {
        fs.writeFileSync(this.getIssuePath(issue.issue_id), JSON.stringify(issue));
    }

    public getIssue(issueId: string): Issue | undefined {
        let issuePath: string = this.getIssuePath(issueId);
        if (!fs.existsSync(issuePath)) {
            return undefined;
        }
        let content: string = fs.readFileSync(issuePath, 'utf8');
        let issue: IIssue = Object.assign({} as IIssue, JSON.parse(content));
        return Translators.toIssue(issue);
    }

    public storeLicense(license: ILicense) {
        let moreInfoUrl: string[] = license.more_info_url;
        if (moreInfoUrl && moreInfoUrl.length > 0) {
            license.more_info_url = [moreInfoUrl[0]];
        }
        fs.writeFileSync(this.getLicensePath(license.name), JSON.stringify(license));
    }

    public getLicense(licenseName: string): License | undefined {
        let licensePath: string = this.getLicensePath(licenseName);
        if (!fs.existsSync(licensePath)) {
            return undefined;
        }
        let content: string = fs.readFileSync(licensePath, 'utf8');
        let license: ILicense = Object.assign({} as ILicense, JSON.parse(content));
        return Translators.toLicense(license);
    }

    /**
     * Check if exist in cache and not expired.
     *
     * @param componentId The component id.
     * @returns true if component exist and not expired.
     */
    public isValid(componentId: string): boolean {
        let scanCacheObject: ScanCacheObject | undefined = this.getScanCacheObject(componentId);
        if (!scanCacheObject) {
            // Artifact not exists in cache
            return false;
        }
        return ScanCacheObject.isValid(scanCacheObject);
    }

    public async storeArtifactComponents(artifacts: IArtifact[]) {
        for (let artifact of artifacts) {
            await this._scanCache.update(artifact.general.component_id, new ScanCacheObject(artifact));
            for (let issue of artifact.issues) {
                this.storeIssue(issue);
            }
            for (let license of artifact.licenses) {
                this.storeLicense(license);
            }
        }
    }

    private getIssuePath(issueId: string): string {
        return path.join(this._issuesCache, issueId);
    }

    private getLicensePath(licenseName: string): string {
        return path.join(this._licensesCache, licenseName);
    }
}
