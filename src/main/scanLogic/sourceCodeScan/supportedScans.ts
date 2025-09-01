import { ConnectionManager } from '../../connect/connectionManager';
import { ConnectionUtils, EntitlementScanFeature } from '../../connect/connectionUtils';
import { LogManager } from '../../log/logManager';
import { ScanUtils } from '../../utils/scanUtils';
import * as semver from 'semver';
import { DYNAMIC_TOKEN_VALIDATION_MIN_XRAY_VERSION } from '../scanRunners/secretsScan';
import { Configuration } from '../../utils/configuration';

export class SupportedScans {
    private _applicability?: boolean;
    private _sast?: boolean;
    private _iac?: boolean;
    private _secrets?: boolean;
    private _tokenValidation?: boolean;
    constructor(private _connectionManager: ConnectionManager, protected _logManager: LogManager) {}

    get tokenValidation(): boolean | undefined {
        return this._tokenValidation;
    }

    public setTokenValidation(value: boolean | undefined): SupportedScans {
        this._tokenValidation = value;
        return this;
    }

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

    public setAgenticCoding(value: boolean | undefined): SupportedScans {
        ScanUtils.setAgneticCodingEnabled(value ?? false);
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
        requests.push(
            this.isTokenValidationEnabled()
                .then(res => this.setTokenValidation(res))
                .catch(err => ScanUtils.onScanError(err, this._logManager, true))
        );
        requests.push(
            this.isAgenticSupported()
            .then(res => this.setAgenticCoding(res))
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
        return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Sast);
    }

    /**
     * Check if Agentic coding is supported for the user
     */
        public async isAgenticSupported(): Promise<boolean> {
            return await ConnectionUtils.testXrayEntitlementForFeature(this._connectionManager.createJfrogClient(), EntitlementScanFeature.Agentic);
        }

    /**
     * Check if token validation scan is enabled
     */
    public async isTokenValidationEnabled(): Promise<boolean> {
        let xraySemver: semver.SemVer = new semver.SemVer(this._connectionManager.xrayVersion);
        if (xraySemver.compare(DYNAMIC_TOKEN_VALIDATION_MIN_XRAY_VERSION) < 0) {
            this._logManager.logMessage(
                'You cannot use dynamic token validation feature on xray version ' +
                    this._connectionManager.xrayVersion +
                    ' as it requires xray version ' +
                    DYNAMIC_TOKEN_VALIDATION_MIN_XRAY_VERSION,
                'INFO'
            );
            return false;
        }
        if (Configuration.enableTokenValidation()) {
            return true;
        }
        let tokenValidation: boolean = await this._connectionManager.isTokenValidationPlatformEnabled();
        if (tokenValidation || process.env.JF_VALIDATE_SECRETS) {
            return true;
        }

        return false;
    }
}
