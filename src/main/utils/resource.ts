import * as fs from 'fs';
import * as path from 'path';

import { IChecksumResult, JfrogClient } from 'jfrog-client-js';
import { ConnectionUtils } from '../connect/connectionUtils';
import { LogManager } from '../log/logManager';
import { Utils } from '../treeDataProviders/utils/utils';
import { ScanUtils } from './scanUtils';

/**
 * Represent a resource file that is fetched (download) from a source URL and can be updated from it if outdated.
 */
export class Resource {
    private static readonly DEFAULT_SERVER: string = 'https://releases.jfrog.io';

    private _connectionManager: JfrogClient;
    // Resource's sha256
    private sha2: string | undefined;

    private _targetDir: string;
    private _name: string;

    constructor(
        public readonly sourceUrl: string,
        private _targetPath: string,
        private _logManager: LogManager,
        connectionManager?: JfrogClient,
        private _mode: fs.Mode = '755'
    ) {
        this._connectionManager =
            connectionManager ?? ConnectionUtils.createJfrogClient(Resource.DEFAULT_SERVER, Resource.DEFAULT_SERVER + '/artifactory', '', '', '', '');
            this._name = Utils.getLastSegment(this._targetPath);
            this._targetDir = path.dirname(this._targetPath);
    }

    private async downloadToFolder(downloadToFolder: string = this._targetDir): Promise<string | undefined> {
        let resourcePath: string = path.join(downloadToFolder,this._name);
        try {
            // Download new
            await this._connectionManager
            .artifactory()
            .download()
            .downloadArtifactToFile(this.sourceUrl, resourcePath);
        } catch (err) {
            this._logManager.logError(<Error>err);
            return undefined;
        }
        return resourcePath;
    }

    private async copyToTarget(filePath: string) {
        if (this.isExists()) {
            fs.rmSync(this._targetPath);
        } else if (!fs.existsSync(this._targetDir)) {
            fs.mkdirSync(this._targetDir);
        }   
        fs.copyFileSync(filePath, this._targetPath);
        fs.chmodSync(this._targetPath, this._mode);
    }

    /**
     * Update the resource to the latest version.
     * @returns true if the resource was updated, false otherwise
     */
    public async update(): Promise<boolean> {
        let tmpFolder: string = ScanUtils.createTmpDir();
        try {
            this._logManager.logMessage('Starting to update resource ' + this._targetPath + ' from ' + this.sourceUrl, 'INFO');
            let resourceTmpPath: string | undefined = await this.downloadToFolder(tmpFolder);
            if (!resourceTmpPath) {
                return false;
            }
            this.copyToTarget(resourceTmpPath);
            this._logManager.logMessage('Resource ' + this._targetPath + ' was update successfully.', 'INFO');
            return true;
        } finally {
            ScanUtils.removeFolder(tmpFolder);
        }
    }

    /**
     * Check if the resource exists in the provided target path.
     * @returns true if file exists in the path, false otherwise
     */
    public isExists(): boolean {
        return fs.existsSync(this._targetPath);
    }

    /**
     * Check if the resource is outdated and has a new version to update
     * @returns true if the resource in the path is outdated (or not exists), false otherwise
     */
    public async isOutdated(): Promise<boolean> {
        // No resource check
        if (!this.isExists()) {
            return true;
        }
        // Check if has update - compare the sha256 of the resource with the latest released resource.
        let checksumResult: IChecksumResult = { sha256: '', sha1: '', md5: '' };
        try {
            checksumResult = await this._connectionManager
            .artifactory()
            .download()
            .getArtifactChecksum(this.sourceUrl);
        } catch (err) {
            this._logManager.logError(<Error>err);
            // In case of failure download anyway
            return true;
        }
        if (!this.sha2) {
            const fileBuffer: Buffer = fs.readFileSync(this._targetPath);
            this.sha2 = ScanUtils.Hash('sha256', fileBuffer.toString());
        }
        return checksumResult.sha256 !== this.sha2;
    }

    public get createTime(): number {
        return fs.statSync(this._targetPath).birthtimeMs;
    }

    public get fullPath(): string {
        return this._targetPath;
    }

    public get name(): string {
        return this._name;
    }
}
