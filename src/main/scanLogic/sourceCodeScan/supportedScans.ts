import { ConnectionManager } from '../../connect/connectionManager';
import { ConnectionUtils, EntitlementScanFeature } from '../../connect/connectionUtils';
import { LogManager } from '../../log/logManager';
import { ScanUtils } from '../../utils/scanUtils';

export class SupportedScans {
    private _applicability?: boolean;
    private _sast?: boolean;
    private _iac?: boolean;
    private _secrets?: boolean;
    constructor(private _connectionManager: ConnectionManager, protected _logManager: LogManager) {}

    get applicability(): boolean | undefined {
        return this._applicability;
    }

    public setApplicability(value: boolean | undefined): SupportedScans {
        this._applicability = value;
        return this;
    }

    get sast(): boolean | undefined {
        return this._sast;
    }

    public setSast(value: boolean | undefined): SupportedScans {
        this._sast = value;
        return this;
    }

    get iac(): boolean | undefined {
        return this._iac;
    }

    public setIac(value: boolean | undefined): SupportedScans {
        this._iac = value;
        return this;
    }

    get secrets(): boolean | undefined {
        return this._secrets;
    }

    public setSecrets(value: boolean | undefined): SupportedScans {
        this._secrets = value;
        return this;
    }

    public hasSupportedScan(): boolean {
        return this.applicability || this.sast || this.iac || this.secrets || false;
    }

    public async getSupportedScans(): Promise<SupportedScans> {
        let requests: Promise<any>[] = [];
        requests.push(
            this.isApplicabilitySupported()
                .then(res => this.setApplicability(res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        requests.push(
            this.isIacSupported()
                .then(res => this.setIac(res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        requests.push(
            this.isSecretsSupported()
                .then(res => this.setSecrets(res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        requests.push(
            this.isSastSupported()
                .then(res => this.setSast(res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        await Promise.all(requests);
        return this;
    }
    /**
     * Check if Contextual Analysis (Applicability) is supported for the user
     */
    public async isApplicabilitySupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Applicability);
    }

    /**
     * Check if Infrastructure As Code (Iac) is supported for the user
     */
    public async isIacSupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Iac);
    }

    /**
     * Check if Secrets scan is supported for the user
     */
    public async isSecretsSupported(): Promise<boolean> {
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Secrets);
    }

    /**
     * Check if SAST scan is supported for the user
     */
    public async isSastSupported(): Promise<boolean> {
        // TODO: change to SAST feature when Xray entitlement service support it.
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Applicability);
    }
}
