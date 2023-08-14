import * as fs from 'fs';
import { IIssue } from 'jfrog-client-js';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { ILicenseCacheObject } from '../types/licenseCacheObject';
import { Utils } from '../utils/utils';

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
    private _licensesCache!: string;
    private _issuesCache!: string;
    // The directory where each project stores its Dependencies CVEs found by Xray.
    private _projectCvesCache!: string;

    public activate(context: vscode.ExtensionContext): ScanCacheManager {
        let storageDir: string | undefined = context.storageUri?.fsPath;
        if (!storageDir) {
            return this;
        }
        this._issuesCache = path.join(storageDir, 'issues');
        // CVEs found in the workspace.
        this._projectCvesCache = path.join(storageDir, 'scanned-cves');
        this._licensesCache = path.join(storageDir, 'licenses');
        Utils.createDirIfNotExists(this._issuesCache);
        Utils.createDirIfNotExists(this._projectCvesCache);
        Utils.createDirIfNotExists(this._licensesCache);
        return this;
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
     * Return Xray issue ID path in file system.
     * @param issueId - the Xray issue ID e.g. XRAY-12345
     * @returns path to the issue in the file system.
     */
    private getIssuePath(issueId: string): string {
        return path.join(this._issuesCache, issueId);
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
