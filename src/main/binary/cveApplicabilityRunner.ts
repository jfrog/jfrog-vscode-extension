import * as os from 'os';
import * as fs from 'fs';
import { ConnectionManager } from '../connect/connectionManager';
import { LogManager } from '../log/logManager';
import { Configuration } from '../utils/configuration';
import { Resource } from '../utils/resource';
import { ScanUtils } from '../utils/scanUtils';
import * as path from 'path';
import { PackageType } from '../types/projectType';

/**
 * Executes the CVE Applicability binary. Each binary's command is a method.
 */
export class CveApplicabilityRunner {
    private static readonly MILLISECONDS_IN_TWO_DAYS: number = 172800000;
    private _resource: Resource;
    private _isOsSupported: boolean = true;
    // A file that contains a timestamp.
    // This tells us when we last checked for an update.
    private _lastUpdateFile: string;
    constructor(connectionManager: ConnectionManager, private _logManager: LogManager) {
        let downloadUrl: string = 'ide-scanners/applicability_scanner/[RELEASE]';
        let binary: string = 'applicability_scanner';
        switch (os.platform()) {
            case 'win32':
                binary += '.exe';
                downloadUrl += '/windows/' + binary;
                break;
            case 'linux':
                downloadUrl += '/linux/' + binary;
                break;
            case 'darwin':
                downloadUrl += '/mac/' + binary;
                break;
            default:
                this._isOsSupported = false;
        }
        this._resource = new Resource(
            path.join(ScanUtils.getHomePath(), 'applicability.scan'),
            downloadUrl,
            binary,
            _logManager,
            Configuration.getRemoteArtifactory() !== '' ? connectionManager.createJfrogClient() : undefined
        );
        this._lastUpdateFile = path.join(this._resource.homeDir, 'LastUpdateTimestamp');
    }

    /**
     * Update Cve Applicability Runner to the latest released.
     */
    public async update(): Promise<void> {
        if (!this.shouldUpdate()) {
            return;
        }
        try {
            await this._resource.update(true);
            // Save time when the update accrued.
            this.saveTime();
        } catch (error) {
            this._logManager.logMessage('failed to update the applicable scanner: ' + error, 'WARN');
        }
    }

    /**
     *
     * @param pathToRoot - Project to scan.
     * @param cvesToScan - CVEs to scan.
     * @param packageType - Project type.
     * @returns Scans a project based on the provided project path. Scans all CVEs or specific ones if 'cveToScan' was provided
     */
    public scan(pathToRoot: string, cvesToScan?: string, packageType?: PackageType): string | undefined {
        try {
            if (!this._isOsSupported) {
                return;
            }
            let cmdArgs: string = '';
            if (packageType === PackageType.NPM) {
                cmdArgs = ' --skipped-folders=node_modules ';
            }
            if (cvesToScan != undefined && cvesToScan.length > 0) {
                cmdArgs += ' --cve-whitelist ' + cvesToScan;
            }
            return this.run(['scan', '"' + pathToRoot + '"', cmdArgs]).toString();
        } catch (error) {
            this._logManager.logMessage('failed to run CVE Applicability scan at ' + pathToRoot + '. ' + error, 'ERR');
            return '{}';
        }
    }

    /**
     * @returns Version of the CVE Applicability runner.
     */
    public version(): string | undefined {
        try {
            if (!this._isOsSupported) {
                return;
            }
            return this.run(['version']).toString();
        } catch (error) {
            this._logManager.logMessage('failed to run CVE Applicability version command.' + error, 'ERR');
            return;
        }
    }

    private shouldUpdate(): boolean {
        if (!this._isOsSupported) {
            return false;
        }
        // Ensure that the last update occurred more than two days ago..
        const timestamp:number = this.getTime()
        return Date.now() - timestamp > CveApplicabilityRunner.MILLISECONDS_IN_TWO_DAYS;
    }

    // Saves the current timestamp.
    private saveTime(){
        fs.writeFileSync(this._lastUpdateFile, Date.now().toString());
    }

    // Returns the last timestamp.
    private getTime():number{
        if (!fs.existsSync(this._lastUpdateFile)) {
            // We don't have the time of the last update.
            return 0;
        }
        const timestamp: string = fs.readFileSync(this._lastUpdateFile).toString();
        if (timestamp === '') {
            return 0;
        }
        return Number(timestamp);
    }

    private run(args: string[], runAt?: string): string {
        return ScanUtils.executeCmd('"' + this._resource.getPath() + '" ' + args.join(' '), runAt).toString();
    }
}
