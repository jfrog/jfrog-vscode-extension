import * as fs from 'fs';

import { IChecksumResult, JfrogClient } from 'jfrog-client-js';
import { ConnectionUtils } from '../connect/connectionUtils';
import { LogManager } from '../log/logManager';
import { Utils } from '../treeDataProviders/utils/utils';
import { ScanUtils } from './scanUtils';

/**
 * Represent a resource file that is fetched (downloaded) from a source and can be updated if outdated.
 */
export class Resource {
    private _connectionManager: JfrogClient;
    // Resource's sha256
    private sha2: string | undefined;

    constructor(
        private _sourceUrl: string,
        private _targetPath: string,
        private _logManager: LogManager,
        connectionManager?: JfrogClient,
        private _mode: fs.Mode = '755'
    ) {
        this._connectionManager =
            connectionManager ??
            ConnectionUtils.createJfrogClient('https://releases.jfrog.io', 'https://releases.jfrog.io/artifactory', '', '', '', '');
    }

    /**
     * Update the resource to the latest version.
     * @returns true if the resource was updated, false otherwise
     */
    public async update(): Promise<boolean> {
        const hasUpdate: boolean = await this.isOutdated();
        if (!hasUpdate) {
            this._logManager.logMessage('Resource ' + this._targetPath + ' is the latest version', 'DEBUG');
            return false;
        }
        this._logManager.logMessage('Starting to update resource ' + this._targetPath + ' from ' + this._sourceUrl, 'INFO');
        // Remove old
        if (this.isExists()) {
            fs.rmSync(this._targetPath);
        } else {
            // make sure target folder exists for download
            let targetDir: string = Utils.getLastSegment(this._targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir);
            }
        }
        // Download new
        await this._connectionManager
            .artifactory()
            .download()
            .downloadArtifactToFile(this._sourceUrl, this._targetPath);
        // Give permissions
        fs.chmodSync(this._targetPath, this._mode);
        this._logManager.logMessage('Resource ' + this._targetPath + ' was successfully updated.', 'INFO');
        return true;
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
        checksumResult = await this._connectionManager
            .artifactory()
            .download()
            .getArtifactChecksum(this._sourceUrl);
        if (!this.sha2) {
            const fileBuffer: Buffer = fs.readFileSync(this._targetPath);
            this.sha2 = ScanUtils.Hash('sha256', fileBuffer.toString());
        }
        return checksumResult.sha256 !== this.sha2;
    }

    public get fullPath(): string {
        return this._targetPath;
    }
}
