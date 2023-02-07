import * as http2 from 'http2';
import {
    ComponentDetails,
    IArtifactoryVersion,
    IJfrogClientConfig,
    IProxyConfig,
    ISummaryRequestModel,
    IXrayVersion,
    JfrogClient
} from 'jfrog-client-js';
import { ServerNotActiveError } from 'jfrog-client-js/dist/src/HttpClient';
import * as semver from 'semver';
import { SemVer } from 'semver';
import { URL } from 'url';
import * as vscode from 'vscode';
import { LogManager } from '../log/logManager';
import { Configuration } from '../utils/configuration';

export class ConnectionUtils {
    private static readonly MINIMAL_XRAY_VERSION_SUPPORTED_FOR_CI: any = semver.coerce('3.21.2');
    private static readonly MINIMAL_XRAY_VERSION_SUPPORTED: any = semver.coerce('3.29.0');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    static readonly USER_AGENT: string = 'jfrog-vscode-extension/' + require('../../../package.json').version;

    /**
     * Validate url string. Used when providing Xray server url.
     * @see vscode.InputBoxOptions.validateInput
     * @param value - Url to validate.
     * @returns string with the error description or the empty string.
     */
    public static validateUrl(value: string): string {
        if (!value) {
            return '';
        }
        let protocol: string | undefined;
        let host: string | undefined;
        try {
            let uri: URL = new URL(value);
            protocol = uri.protocol;
            host = uri.host;
        } catch {
            // ignore
        }
        return protocol && host ? '' : 'Please enter a valid URL';
    }

    public static validateXrayUrl(value: string) {
        if (!value) {
            return 'URL cannot be empty.';
        }
        return ConnectionUtils.validateUrl(value);
    }

    /**
     * Validate input field not empty.
     * @see vscode.InputBoxOptions.validateInput
     * @param value - The value to check.
     * @returns string with the error description or the empty string.
     */
    public static validateFieldNotEmpty(value: string): string {
        return value ? '' : 'Value cannot be empty';
    }

    /**
     * Validate Artifactory Connection.
     * @param rtUrl - Artifactory URL
     * @param username - Username
     * @param password - Password
     * @param accessToken - Access Token
     */
    public static async validateArtifactoryConnection(rtUrl: string, username: string, password: string, accessToken: string): Promise<boolean> {
        let jfrogClient: JfrogClient = this.createJfrogClient('', rtUrl, '', username, password, accessToken);
        return await jfrogClient
            .artifactory()
            .system()
            .ping();
    }

    public static async isPlatformUrl(url: string, username: string, password: string, accessToken: string): Promise<boolean> {
        // If URL ends with '/xray', the URL is an Xray URL
        if (!url || url.endsWith('/xray') || url.endsWith('/xray/')) {
            return false;
        }

        // Ping to '<url>/xray'
        let jfrogClient: JfrogClient = this.createJfrogClient(url, '', '', username, password, accessToken);
        return await jfrogClient
            .xray()
            .system()
            .ping();
    }

    /**
     * Check permissions and version.
     * @returns true iff success.
     * @param xrayUrl
     * @param username
     * @param password
     * @param accessToken - Access Token
     */
    public static async checkXrayConnectionAndPermissions(
        xrayUrl: string,
        username: string,
        password: string,
        accessToken: string,
        prompt: boolean,
        logger: LogManager
    ): Promise<boolean> {
        let jfrogClient: JfrogClient = this.createJfrogClient('', '', xrayUrl, username, password, accessToken);
        try {
            await ConnectionUtils.testComponentPermission(jfrogClient);
            let xrayVersion: string = await ConnectionUtils.testXrayVersion(jfrogClient);
            if (prompt) {
                vscode.window.showInformationMessage(xrayVersion);
            } else {
                logger.logMessage(xrayVersion, 'DEBUG');
            }
        } catch (error) {
            if (error instanceof ServerNotActiveError) {
                const answer: string | undefined = await vscode.window.showErrorMessage((<ServerNotActiveError>error).message, 'Activate Server');
                if (answer === 'Activate Server') {
                    vscode.env.openExternal(vscode.Uri.parse((<ServerNotActiveError>error).activationUrl));
                }
            } else if (prompt) {
                vscode.window.showErrorMessage((<any>error).message || error, <vscode.MessageOptions>{ modal: true });
            } else {
                logger.logMessage((<any>error).message, 'DEBUG');
            }
            return Promise.resolve(false);
        }
        return Promise.resolve(true);
    }

    /**
     * Check Artifactory connection.
     * @returns true iff success.
     * @param rtUrl
     * @param username
     * @param password
     * @param accessToken - Access Token
     */
    public static async checkArtifactoryConnection(
        rtUrl: string,
        username: string,
        password: string,
        accessToken: string,
        prompt: boolean,
        logger: LogManager
    ): Promise<boolean> {
        const status: boolean = await ConnectionUtils.validateArtifactoryConnection(rtUrl, username, password, accessToken);
        let statusStr: string = 'failed.';
        if (status) {
            statusStr = 'success.';
        }
        const msg: string = 'Artifactory connection ' + statusStr;
        if (prompt) {
            vscode.window.showInformationMessage(msg);
        } else {
            logger.logMessage(msg, 'DEBUG');
        }
        return Promise.resolve(status);
    }

    public static async testXrayVersion(jfrogClient: JfrogClient): Promise<string> {
        let xrayVersion: string = await this.getXrayVersion(jfrogClient);
        if (!(await this.isXrayVersionCompatible(xrayVersion, ConnectionUtils.MINIMAL_XRAY_VERSION_SUPPORTED))) {
            return Promise.reject(
                'Unsupported Xray version: ' + xrayVersion + ', version ' + ConnectionUtils.MINIMAL_XRAY_VERSION_SUPPORTED + ' or above is required.'
            );
        }
        return Promise.resolve('Successfully connected to Xray version: ' + xrayVersion);
    }

    public static async testXrayVersionForScanGraph(jfrogClient: JfrogClient, logger: LogManager): Promise<boolean> {
        let xrayVersion: string = await this.getXrayVersion(jfrogClient);
        if (!(await this.isXrayVersionCompatible(xrayVersion, ConnectionUtils.MINIMAL_XRAY_VERSION_SUPPORTED))) {
            logger.logError(new Error('Dependencies scan is supported only on Xray >= 3.29.0'), true);
            return false;
        }
        return true;
    }

    public static async testXrayEntitlement(jfrogClient: JfrogClient, feature: string): Promise<boolean> {
        // TODO: uncomment when entitlement api is published
        // return await jfrogClient
        //     .xray()
        //     .entitlements()
        //     .feature(feature);
        return true;
    }

    public static async testXrayVersionForCi(jfrogClient: JfrogClient, logger: LogManager): Promise<boolean> {
        let xrayVersion: string = await this.getXrayVersion(jfrogClient);
        if (!(await this.isXrayVersionCompatible(xrayVersion, ConnectionUtils.MINIMAL_XRAY_VERSION_SUPPORTED_FOR_CI))) {
            logger.logMessage(
                'Unsupported Xray version for builds scan: ' +
                    xrayVersion +
                    ', version ' +
                    ConnectionUtils.MINIMAL_XRAY_VERSION_SUPPORTED_FOR_CI +
                    ' or above is required. Scanning builds without Xray results...',
                'WARN'
            );
            return false;
        }
        return true;
    }

    public static async isXrayVersionCompatible(curXrayVersion: string, minXrayVersion: SemVer): Promise<boolean> {
        if (curXrayVersion !== 'Unknown') {
            let xraySemver: semver.SemVer = new semver.SemVer(curXrayVersion);
            return xraySemver.compare(minXrayVersion) >= 0;
        }
        return true;
    }

    public static async getXrayVersion(jfrogClient: JfrogClient): Promise<string> {
        let xrayVersion: IXrayVersion = await jfrogClient
            .xray()
            .system()
            .version();
        return xrayVersion.xray_version;
    }

    public static async getArtifactoryVersion(jfrogClient: JfrogClient): Promise<string> {
        let artifactoryVersion: IArtifactoryVersion = await jfrogClient
            .artifactory()
            .system()
            .version();
        return artifactoryVersion.version;
    }

    public static async testComponentPermission(jfrogClient: JfrogClient): Promise<any> {
        let summaryRequest: ISummaryRequestModel = {
            component_details: [new ComponentDetails('testComponent')]
        } as ISummaryRequestModel;
        try {
            await jfrogClient
                .xray()
                .summary()
                .component(summaryRequest);
        } catch (error) {
            if (!(<any>error).response) {
                return Promise.reject('Could not connect to Xray: ' + error);
            }
            let message: string = '';
            switch ((<any>error).response.status) {
                case http2.constants.HTTP_STATUS_UNAUTHORIZED:
                    message = 'Please check your credentials.';
                    break;
                case http2.constants.HTTP_STATUS_FORBIDDEN:
                    message = "Please make sure that the user has 'View Components' permission in Xray.";
                    break;
            }
            return Promise.reject((<any>error).message + '. ' + message);
        }
        return Promise.resolve();
    }

    public static createJfrogClient(
        platformUrl: string,
        artifactoryUrl: string,
        xrayUrl: string,
        username: string,
        password: string,
        accessToken: string
    ): JfrogClient {
        let clientConfig: IJfrogClientConfig = {
            platformUrl: platformUrl,
            artifactoryUrl: artifactoryUrl,
            xrayUrl: xrayUrl,
            username: username,
            password: password,
            accessToken: accessToken,
            headers: {},
            proxy: ConnectionUtils.getProxyConfig(),
            retries: Configuration.getConnectionRetries()
        } as IJfrogClientConfig;
        ConnectionUtils.addUserAgentHeader(clientConfig);
        ConnectionUtils.addProxyAuthHeader(clientConfig);
        return new JfrogClient(clientConfig);
    }

    public static addUserAgentHeader(clientConfig: IJfrogClientConfig) {
        if (clientConfig.headers) {
            clientConfig.headers['User-Agent'] = ConnectionUtils.USER_AGENT;
        }
    }

    public static addProxyAuthHeader(clientConfig: IJfrogClientConfig) {
        if (clientConfig.proxy) {
            let proxyAuthHeader: string | undefined = Configuration.getProxyAuth();
            if (proxyAuthHeader && clientConfig.headers) {
                clientConfig.proxy.proxyAuthorizationHeader = proxyAuthHeader;
                clientConfig.headers['Proxy-Authorization'] = proxyAuthHeader;
            }
        }
    }

    public static getProxyConfig(): IProxyConfig | boolean {
        let proxySupport: string | undefined = vscode.workspace.getConfiguration().get('http.proxySupport', 'override');
        if (proxySupport === 'off') {
            return false;
        }
        let httpProxy: string | undefined = vscode.workspace.getConfiguration().get('http.proxy');

        if (!httpProxy) {
            return false;
        }

        let proxyConfig: IProxyConfig = {} as IProxyConfig;
        let proxyUri: URL = new URL(httpProxy);
        proxyConfig.protocol = proxyUri.protocol;
        proxyConfig.host = proxyUri.host;
        if (proxyUri.port) {
            proxyConfig.port = +proxyUri.port;
        }
        return proxyConfig;
    }
}
