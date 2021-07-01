import {LogManager} from "../../log/logManager";
import path from "path";
import * as fs from 'fs';
import AdmZip from "adm-zip";
import {IDetailsResponse} from "../../../../../jfrog-client-js";

export enum Type {
    BUILD_INFO, BUILD_SCAN_RESULTS
}

export class BuildsScanCache {
    //private static final String INVALID_CACHE_FMT = "Failed reading cache file for '%s/%s', zapping the old cache and starting a new one.";
    //public static readonly MAX_BUILDS: number = 100; todo
    // Each build should have 1 build info file and 1 Xray scan results file
    public static readonly MAX_FILES: number = 100 * 2;
    private static readonly CACHE_BASE_PATH: string = path.resolve(require('os').homedir(), ".jfrog-vscode-extension", "ci-cache");

    private readonly buildsDir: string;

    constructor(private _projectName: string, private _logger: LogManager) {
        this.buildsDir = path.resolve(BuildsScanCache.CACHE_BASE_PATH, this._projectName); // todo base 64
        if (!fs.existsSync(this.buildsDir)) {
            fs.mkdirSync(this.buildsDir, {recursive: true});
        }
        this.cleanUpOldBuilds();
    }

    private cleanUpOldBuilds(): void {
        const currentBuildScanCaches: string[] = fs.readdirSync(this.buildsDir).sort();
        for (let i: number = BuildsScanCache.MAX_FILES; i < currentBuildScanCaches.length; i++) {
            const pathToDelete: string = path.resolve(this.buildsDir, currentBuildScanCaches[i]);
            this._logger.logMessage('Deleting ' + pathToDelete, 'DEBUG');
            fs.unlinkSync(pathToDelete);
        }
    }

    public save(content: string, buildName: string, buildNumber: string, type: Type): void {
        let zip: AdmZip = new AdmZip();
        zip.addFile(type.toString(), Buffer.alloc(content.length, content));
        zip.writeZip(this.getZipPath(buildName, buildNumber, type));
    }

    public load(buildName: string, buildNumber: string, type: Type): any {
        const buildPath: string = this.getZipPath(buildName, buildNumber, type);
        if (!fs.existsSync(buildPath)) {
            return '';
        }
        let zip: AdmZip = new AdmZip(buildPath);
        let zipEntries: AdmZip.IZipEntry[] = zip.getEntries();
        for (let i: number = 0; i < zipEntries.length; i++) {
            if (zipEntries[i].entryName === type.toString()) {
                return zipEntries[i].getData().toString('utf8');
            }
        }
        // todo handle empty zip.
        return '';
    }

    public loadBuildInfo(buildName: string, buildNumber: string): any {
        let build: any = this.load(buildName, buildNumber, Type.BUILD_INFO);
        if (!build) {
            return null;
        }
        return JSON.parse(build);
    }

    public loadScanResults(buildName: string, buildNumber: string): IDetailsResponse {
        return this.load(buildName, buildNumber, Type.BUILD_SCAN_RESULTS);
    }

    public getZipPath(buildName: string, buildNumber: string, type: Type): string {
        const buildIdentifier: string = buildName + '_' + buildNumber;
        return path.resolve(this.buildsDir, type.toString() + Buffer.from(buildIdentifier).toString('base64') + '.zip');
    }
}