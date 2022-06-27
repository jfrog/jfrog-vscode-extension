import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { JfrogClient } from 'jfrog-client-js';
import { IChecksumResult } from 'jfrog-client-js';
import { ConnectionUtils } from '../connect/connectionUtils';
import { LogManager } from '../log/logManager';

export class Resource {
    private static readonly MILLISECONDS_IN_HOUR: number = 3600000;
    private downloadTarget: string;
    private downloadDir: string;
    private path: string;

    private _connectionManager: JfrogClient = ConnectionUtils.createJfrogClient(
        'https://releases.jfrog.io',
        'https://releases.jfrog.io/artifactory',
        '',
        '',
        '',
        ''
    );

    constructor(
        homeDir: string,
        private downloadSource: string,
        resourceName: string,
        private _logManager: LogManager,
        connectionManager?: JfrogClient
    ) {
        this.downloadDir = path.join(homeDir, 'download');
        this.downloadTarget = path.join(this.downloadDir, resourceName);
        this.path = path.join(homeDir, resourceName);
        if (connectionManager !== undefined) {
            this._connectionManager = connectionManager;
        }
    }

    public async update(withExecPrem: boolean) {
        const updateAvailable: boolean = await this.isUpdateAvailable();
        if (!updateAvailable) {
            return;
        }
        this._logManager.logMessage('Downloading new update from ' + this.downloadTarget, 'DEBUG');
        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        } else if (Date.now() - fs.statSync(this.downloadDir).birthtimeMs <= Resource.MILLISECONDS_IN_HOUR) {
            // By here, someone else is already downloading the scanner.
            return;
        } else {
            // Seems like it is a left over from other download.
            this._logManager.logMessage('Cleanup old update process at' + this.downloadDir, 'DEBUG');
            fs.rmSync(this.downloadDir);
        }
        try {
            await this._connectionManager
                .artifactory()
                .download()
                .downloadArtifactToFile(this.downloadSource, this.downloadTarget);
            if (withExecPrem) {
                fs.chmod(this.downloadTarget, '755', err => {
                    if (err) throw err;
                });
            }
            fs.copyFile(this.downloadTarget, this.path, err => {
                if (err) throw err;
            });
            this._logManager.logMessage('Update resource was successfully upgraded for ' + this.downloadSource, 'DEBUG');
        } finally {
            fs.rmSync(this.downloadDir, { recursive: true, force: true });
        }
    }

    public async isUpdateAvailable(): Promise<boolean> {
        if (!fs.existsSync(this.path)) {
            return true;
        }
        let checksumResult: IChecksumResult = { sha256: '', sha1: '', md5: '' };
        try {
            checksumResult = await this._connectionManager
                .artifactory()
                .download()
                .getArtifactChecksum(this.downloadSource);
        } catch (error) {
            this._logManager.logMessage("Error occurred while fetching an update from '" + this.downloadSource + "'. Error: " + error, 'ERR');
            return false;
        }
        // Compare the sha256 of the cve applicability binary with the latest released binary.
        const fileBuffer: Buffer = fs.readFileSync(this.path);
        const hashSum: crypto.Hash = crypto.createHash('sha256').update(fileBuffer);
        const sha2: string = hashSum.digest('hex');
        return checksumResult.sha256 !== sha2;
    }

    public getPath(): string {
        return this.path;
    }
}
