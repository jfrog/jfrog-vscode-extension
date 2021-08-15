import AdmZip, { IZipEntry } from 'adm-zip';
import * as fs from 'fs';
import { IDetailsResponse } from 'jfrog-client-js';
import * as os from 'os';
import * as path from 'path';
import { LogManager } from '../log/logManager';

export enum Type {
    BUILD_INFO,
    BUILD_SCAN_RESULTS
}

export class BuildsScanCache {
    // Each build should have 1 build info file and 1 Xray scan results file
    public static readonly MAX_FILES: number = 100 * 2;
    private static readonly CACHE_BASE_PATH: string = path.resolve(os.homedir(), '.jfrog-vscode-extension', 'ci-cache');

    private readonly buildsDir: string;

    constructor(private _projectName: string, private _logger: LogManager) {
        this.buildsDir = path.resolve(BuildsScanCache.CACHE_BASE_PATH, this.getNameInBase64(this._projectName));
        if (!fs.existsSync(this.buildsDir)) {
            fs.mkdirSync(this.buildsDir, { recursive: true });
        }
        this.cleanUpOldBuilds();
    }

    private getNameInBase64(str: string) {
        return Buffer.from(str).toString('base64');
    }

    /**
     * Clean up old builds.
     * Sorting by the timestamp prefix, deleting from the beginning (oldest).
     * @private
     */
    private cleanUpOldBuilds(): void {
        const currentBuildScanCaches: string[] = fs
            .readdirSync(this.buildsDir)
            .sort()
            .reverse();
        for (let i: number = BuildsScanCache.MAX_FILES; i < currentBuildScanCaches.length; i++) {
            const pathToDelete: string = path.resolve(this.buildsDir, currentBuildScanCaches[i]);
            this._logger.logMessage('Deleting ' + pathToDelete, 'DEBUG');
            fs.unlinkSync(pathToDelete);
        }
    }

    public save(content: string, timestamp: string, buildName: string, buildNumber: string, type: Type): void {
        let zip: AdmZip = new AdmZip();
        zip.addFile(type.toString(), Buffer.alloc(content.length, content));
        zip.writeZip(this.getZipPath(timestamp, buildName, buildNumber, type));
    }

    public load(timestamp: string, buildName: string, buildNumber: string, type: Type): any {
        const buildPath: string = this.getZipPath(timestamp, buildName, buildNumber, type);
        if (!fs.existsSync(buildPath)) {
            return '';
        }
        let zip: AdmZip = new AdmZip(buildPath);
        let entry: IZipEntry | null = zip.getEntry(type.toString());
        if (!entry) {
            throw new Error('Could not find expected content in archive in cache');
        }
        return entry.getData().toString('utf8');
    }

    public loadBuildInfo(timestamp: string, buildName: string, buildNumber: string): any {
        let build: any = this.load(timestamp, buildName, buildNumber, Type.BUILD_INFO);
        if (!build) {
            return null;
        }
        return JSON.parse(build);
    }

    public loadScanResults(timestamp: string, buildName: string, buildNumber: string): IDetailsResponse | null {
        let response: any = this.load(timestamp, buildName, buildNumber, Type.BUILD_SCAN_RESULTS);
        if (!response) {
            return null;
        }
        return Object.assign({} as IDetailsResponse, JSON.parse(response));
    }

    /**
     * Returns the expected file path to the zip in cache.
     * Zip name for example: '012345_0<base64 build name>.zip'
     * @param timestamp
     * @param buildName
     * @param buildNumber
     * @param type - build info or build scan results
     */
    public getZipPath(timestamp: string, buildName: string, buildNumber: string, type: Type): string {
        const buildIdentifier: string = buildName + '_' + buildNumber;
        return path.resolve(this.buildsDir, timestamp + '_' + type.toString() + this.getNameInBase64(buildIdentifier) + '.zip');
    }
}
