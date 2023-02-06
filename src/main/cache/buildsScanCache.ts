import * as fs from 'fs';
import { IDetailsResponse } from 'jfrog-client-js';
import * as path from 'path';
import { LogManager } from '../log/logManager';
import { ScanUtils } from '../utils/scanUtils';

export enum Type {
    BUILD_INFO,
    BUILD_SCAN_RESULTS
}

export class BuildsScanCache {
    // Each build should have 1 build info file and 1 Xray scan results file
    public static readonly MAX_FILES: number = 100 * 2;
    private static readonly CACHE_BASE_PATH: string = path.resolve(ScanUtils.getHomePath(), 'ci-cache');

    private readonly buildsDir: string;

    constructor(private _projectKey: string, private _url: string, private _logger: LogManager) {
        this.buildsDir = path.resolve(BuildsScanCache.CACHE_BASE_PATH, ScanUtils.Hash('sha1', this._projectKey + '_' + this._url));
        if (!fs.existsSync(this.buildsDir)) {
            fs.mkdirSync(this.buildsDir, { recursive: true });
        }
        this.cleanUpOldBuilds();
    }

    /**
     * Clean up old builds.
     * Sorting by the timestamp prefix, deleting from the beginning (oldest).
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

    public save(content: string, timestamp: string, buildName: string, buildNumber: string, projectKey: string, type: Type): void {
        ScanUtils.saveAsZip(this.getZipPath(timestamp, buildName, buildNumber, projectKey, type),  {fileName: type.toString(), content: content});
    }

    public load(timestamp: string, buildName: string, buildNumber: string, projectKey: string, type: Type): any {
        return ScanUtils.extractZipEntry(this.getZipPath(timestamp, buildName, buildNumber, projectKey, type),type.toString());
    }

    public loadBuildInfo(timestamp: string, buildName: string, buildNumber: string, projectKey: string): any {
        let build: any = this.load(timestamp, buildName, buildNumber, projectKey, Type.BUILD_INFO);
        if (!build) {
            return null;
        }
        return JSON.parse(build);
    }

    public loadScanResults(timestamp: string, buildName: string, buildNumber: string, projectKey: string): IDetailsResponse | null {
        let response: any = this.load(timestamp, buildName, buildNumber, projectKey, Type.BUILD_SCAN_RESULTS);
        if (!response) {
            return null;
        }
        return Object.assign({} as IDetailsResponse, JSON.parse(response));
    }

    /**
     * Returns the expected file path to the zip in cache.
     * Zip name for example: '012345_0<sha1 of buildName_buildNumber_projectKey>.zip'
     * @param timestamp   - Build timestamp
     * @param buildName   - Build name
     * @param buildNumber - Build number
     * @param projectKey  - Project key
     * @param type - build info or build scan results
     */
    public getZipPath(timestamp: string, buildName: string, buildNumber: string, projectKey: string, type: Type): string {
        let buildIdentifier: string = buildName + '_' + buildNumber;
        if (projectKey) {
            buildIdentifier += '_' + projectKey;
        }
        return path.resolve(this.buildsDir, timestamp + '_' + type.toString() + ScanUtils.Hash('sha1', buildIdentifier) + '.zip');
    }
}
