import * as os from 'os';
import { ConnectionManager } from '../connect/connectionManager';
import { LogManager } from '../log/logManager';
import { Configuration } from '../utils/configuration';
import { Resource } from '../utils/resource';
import { ScanUtils } from '../utils/scanUtils';
import * as path from 'path';
import { PackageType } from '../types/projectType';
/**
 * Executes the CVE Applicability binary. Each binary command is a method.
 */
export class CveApplicabilityRunner {
    private _resource: Resource;
    private _isOsSupported: boolean = true;
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
    }

    /**
     * Update the runner(binary) to latest release.
     */
    public async update(): Promise<void> {
        if (!this._isOsSupported) {
            return;
        }
        try {
            await this._resource.update(true);
        } catch (error) {
            this._logManager.logMessage('failed to update the applicable scanner: ' + error, 'WARN');
        }
    }

    /**
     *
     * @param pathToRoot - Project to scan.
     * @param cvesToScan - CVEs to search.
     * @param packageType - Project type.
     * @returns Command output or undefined if the current OS is not supported.
     */
    public scan(pathToRoot: string, cvesToScan?: string, packageType?: PackageType): string | undefined {
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
        return ScanUtils.executeCmd(this._resource.getPath() + ' scan ' + pathToRoot + cmdArgs, pathToRoot).toString();
    }

    public version(): string | undefined {
        if (!this._isOsSupported) {
            return;
        }
        return ScanUtils.executeCmd(this._resource.getPath() + ' version ').toString();
    }
}
