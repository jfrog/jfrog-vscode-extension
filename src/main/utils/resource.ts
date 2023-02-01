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
    // Cached remote resource's sha256
    private _remoteSha256: string | undefined;

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

    /**
     * Download the resource to the given folder
     * @param downloadToFolder - the folder that the resource will be downloaded to
     * @returns the full path of the file that was downloaded successfully, undefined otherwise
     */
    private async downloadToFolder(downloadToFolder: string = this._targetDir): Promise<string | undefined> {
        try {
            let resourcePath: string = path.join(downloadToFolder, this._name);
            // Download new
            await this._connectionManager
                .artifactory()
                .download()
                .downloadArtifactToFile(this.sourceUrl, resourcePath);
            return this.calculateLocalChecksum(resourcePath) === this._remoteSha256 ? resourcePath : undefined;
        } catch (err) {
            this._logManager.logError(<Error>err);
            return undefined;
        }
    }

    /**
     * Copy the given file to the target path, override the file if already exists.
     * Gives the configured permission to it and creates the target directory if not exists.
     * @param filePath - the file to copy
     */
    private async copyToTargetAndApplyPermissions(filePath: string) {
        if (this.isExists()) {
            // Remove old file
            fs.rmSync(this._targetPath);
        } else if (!fs.existsSync(this._targetDir)) {
            // Make sure target directory exist
            fs.mkdirSync(this._targetDir, { recursive: true } as fs.MakeDirectoryOptions);
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
            this._logManager.logMessage('Starting to update resource ' + this._name + ' from ' + this.sourceUrl, 'DEBUG');
            let resourceTmpPath: string | undefined = await this.downloadToFolder(tmpFolder);
            if (!resourceTmpPath) {
                this._logManager.logMessage('Resource ' + this._name + ' update failed.', 'ERR');
                return false;
            }
            this.copyToTargetAndApplyPermissions(resourceTmpPath);
            this._logManager.logMessage('Resource ' + this._name + ' was update successfully.', 'DEBUG');
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
        this._remoteSha256 = await this.calculateRemoteChecksum();
        if (!this._remoteSha256) {
            // In case of failure download anyway to make sure
            return true;
        }
        return this._remoteSha256 !== this.calculateLocalChecksum(this._targetPath);
    }

    private async calculateRemoteChecksum(): Promise<string | undefined> {
        try {
            let checksumResult: IChecksumResult = await this._connectionManager
                .artifactory()
                .download()
                .getArtifactChecksum(this.sourceUrl);
            return checksumResult ? checksumResult.sha256 : undefined;
        } catch (err) {
            this._logManager.logError(<Error>err);
            return undefined;
        }
    }

    private calculateLocalChecksum(filePath: string): string | undefined {
        if (!fs.existsSync(filePath)) {
            return undefined;
        }
        const fileBuffer: Buffer = fs.readFileSync(filePath);
        return ScanUtils.Hash('sha256', fileBuffer.toString());
    }

    public get fullPath(): string {
        return this._targetPath;
    }

    public get name(): string {
        return this._name;
    }
}
