import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { JfrogClient } from 'jfrog-client-js';
import { IChecksumResult } from 'jfrog-client-js';
import { ConnectionUtils } from '../connect/connectionUtils';
import { LogManager } from '../log/logManager';

// Resource classes represent generic instances of external artifact (e.g. binary).
export class Resource {
    // You should not change this variable. This may only be done for testing purposes.
    public static MILLISECONDS_IN_HOUR: number = 3600000;
    // From which to download from.
    private downloadTarget: string;
    // To which dir download the resource.
    private downloadDir: string;
    //A local path to the resource
    private path: string;
    // Resource's sha256
    private sha2: string | undefined;

    private _connectionManager: JfrogClient = ConnectionUtils.createJfrogClient(
        'https://releases.jfrog.io',
        'https://releases.jfrog.io/artifactory',
        '',
        '',
        '',
        ''
    );

    constructor(
        private _homeDir: string,
        private downloadSource: string,
        resourceName: string,
        private _logManager: LogManager,
        connectionManager?: JfrogClient
    ) {
        this.downloadDir = path.join(_homeDir, 'download');
        this.downloadTarget = path.join(this.downloadDir, resourceName);
        this.path = path.join(_homeDir, resourceName);
        if (connectionManager !== undefined) {
            // Override the default connection manager.
            this._connectionManager = connectionManager;
        }
    }

    public get homeDir(): string {
        return this._homeDir;
    }

    // Update the resource to the latest released
    public async update(withExecPrem: boolean) {
        const updateAvailable: boolean = await this.isUpdateAvailable();
        if (!updateAvailable) {
            return;
        }
        this._logManager.logMessage('Downloading new update from ' + this.downloadTarget, 'DEBUG');
        if (this.isUpdateStarted()) {
            if (this.isUpdateStuck() === false) {
                return;
            }
            fs.rmSync(this.downloadDir, { recursive: true });
        }
        fs.mkdirSync(this.downloadDir, { recursive: true });
        try {
            await this._connectionManager
                .artifactory()
                .download()
                .downloadArtifactToFile(this.downloadSource, this.downloadTarget);
            if (withExecPrem) {
                fs.chmodSync(this.downloadTarget, '755');
            }
            fs.copyFileSync(this.downloadTarget, this.path);
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

        checksumResult = await this._connectionManager
            .artifactory()
            .download()
            .getArtifactChecksum(this.downloadSource);

        // Compare the sha256 of the resource with the latest released resource.
        if (this.sha2 === undefined) {
            const fileBuffer: Buffer = fs.readFileSync(this.path);
            const hashSum: crypto.Hash = crypto.createHash('sha256').update(fileBuffer);
            this.sha2 = hashSum.digest('hex');
        }
        return checksumResult.sha256 !== this.sha2;
    }

    public getPath(): string {
        return this.path;
    }

    private isUpdateStarted(): boolean {
        return fs.existsSync(this.downloadDir);
    }

    private isUpdateStuck(): boolean {
        return Date.now() - fs.statSync(this.downloadDir).birthtimeMs > Resource.MILLISECONDS_IN_HOUR;
    }
}
