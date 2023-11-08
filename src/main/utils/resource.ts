import * as fs from 'fs';
import * as path from 'path';

import { IChecksumResult, JfrogClient } from 'jfrog-client-js';
import { LogManager } from '../log/logManager';
import { Utils } from './utils';
import { ScanUtils } from './scanUtils';

/**
 * Represent a resource file that is fetched (download) from a source URL and can be updated from it if outdated.
 */
export class Resource {
    private static readonly RESOURCE_CHECK_UPDATE_INTERVAL_MILLISECS: number = 1000 * 60 * 60 * 24;

    private _cacheRemoteSha256: string | undefined;

    private _targetDir: string;
    private _name: string;
    private lastUpdateTimestamp?: number;

    constructor(
        public readonly sourceUrl: string,
        private _targetPath: string,
        private _logManager: LogManager,
        private _jfrogClient: JfrogClient,
        private _mode: fs.Mode = '700'
    ) {
        this._name = Utils.getLastSegment(this._targetPath);
        this._targetDir = path.dirname(this._targetPath);
    }

    /**
     * Download the resource to the given folder
     * @param downloadToFolder - the folder that the resource will be downloaded to
     * @returns the full path of the file that was downloaded successfully, undefined otherwise
     */
    private async download(downloadToFolder: string = this._targetDir): Promise<string> {
        let resourcePath: string = path.join(downloadToFolder, this.sourceUrl.substring(this.sourceUrl.lastIndexOf('/') + 1));
        this._logManager.logMessage('Starting to update resource ' + this._name + ' from ' + this.sourceUrl, 'DEBUG');
        await this._jfrogClient
            .artifactory()
            .download()
            .downloadArtifactToFile(this.sourceUrl, resourcePath);
        if (!(await this.isLocalAndRemoteChecksumMatch(resourcePath))) {
            if (this._cacheRemoteSha256) {
                throw Error('Local checksum is not match to the remote');
            } else {
                this._logManager.logMessage("Can't get 'x-checksum-sha256' header from " + this.sourceUrl, 'WARN');
            }
        }
        return resourcePath;
    }

    /**
     * if the given temp file is a binary within a zip, replace and extract its content to the target dir.
     * if the given file is a binary, replace and copy it to the target path
     * @param tempPath - the file to copy into target
     */
    public async copyToTarget(tempPath: string) {
        if (tempPath.endsWith('.zip')) {
            await ScanUtils.removeFolder(this._targetDir);
            Utils.extractZip(tempPath, this._targetDir);
            // Copy zip file to folder to calculate checksum
            fs.copyFileSync(tempPath, this.getTargetPathAsZip());
        } else {
            Utils.removeFileIfExists(this._targetPath);
            fs.copyFileSync(tempPath, this._targetPath);
            fs.chmodSync(this._targetPath, this._mode);
        }
    }

    /**
     * Update the resource to the latest version.
     * if remoteSha256 is not set a request for the remote will be sent to check the most recent checksum
     * @returns true if the resource was updated, false otherwise
     */
    public async update(): Promise<boolean> {
        let tmpFolder: string = ScanUtils.createTmpDir();
        try {
            await this.copyToTarget(await this.download(tmpFolder));
            this._logManager.logMessage('Resource ' + this._name + ' was update successfully.', 'DEBUG');
            return true;
        } catch (error) {
            this._logManager.logMessage('Updating resource ' + this._name + ' failed. err:' + error, 'ERR');
            throw error;
        } finally {
            ScanUtils.removeFolder(tmpFolder);
        }
    }

    private async isLocalAndRemoteChecksumMatch(localFile: string): Promise<boolean> {
        return this.calculateLocalChecksum(localFile) === (this._cacheRemoteSha256 ?? (await this.getRemoteChecksum()));
    }

    public isExists(): boolean {
        return fs.existsSync(this._targetPath);
    }

    private getTargetPathAsZip(): string {
        if (this._targetPath.endsWith('.zip')) {
            return this._targetPath;
        }
        let extensionIdx: number = this.name.lastIndexOf('.');
        let cleanName: string = extensionIdx > 0 ? this.name.substring(0, extensionIdx) : this.name;
        return Utils.addZipSuffix(path.join(this._targetDir, cleanName));
    }

    /**
     * Check if the resource is outdated and has a new version to update.
     * Sets the remoteSha256 attribute base on the most recent value in the remote server.
     * @returns true if the resource in the path is outdated (or not exists), false otherwise
     */
    public async isOutdated(): Promise<boolean> {
        // No resource check
        if (!this.isExists()) {
            return true;
        }
        if (!this.shouldCheckOutdated()) {
            return false;
        }
        this.lastUpdateTimestamp = Date.now();
        // Check if has update - compare the sha256 of the resource with the latest released resource.
        this._cacheRemoteSha256 = await this.getRemoteChecksum();
        if (!this._cacheRemoteSha256) {
            // In case of failure download anyway to make sure
            return true;
        }
        return (
            this._cacheRemoteSha256 !== this.calculateLocalChecksum(this.sourceUrl.includes('.zip') ? this.getTargetPathAsZip() : this._targetPath)
        );
    }

    private shouldCheckOutdated(): boolean {
        return !this.lastUpdateTimestamp || Date.now() - this.lastUpdateTimestamp > Resource.RESOURCE_CHECK_UPDATE_INTERVAL_MILLISECS;
    }

    private async getRemoteChecksum(): Promise<string | undefined> {
        try {
            let checksumResult: IChecksumResult = await this._jfrogClient
                .artifactory()
                .download()
                .getArtifactChecksum(this.sourceUrl);
            return checksumResult?.sha256;
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
        return ScanUtils.Hash('SHA256', fileBuffer);
    }

    public async run(args: string[], env?: NodeJS.ProcessEnv | undefined): Promise<any> {
        let command: string = '"' + this.fullPath + '" ' + args.join(' ');
        this._logManager.debug("Executing '" + command + "' in directory '" + this._targetDir + "'");
        return await ScanUtils.executeCmdAsync(command, this._targetDir, env);
    }

    public get fullPath(): string {
        return this._targetPath;
    }

    public get name(): string {
        return this._name;
    }
}
