import * as http2 from 'http2';
import * as semver from 'semver';
import { URL } from 'url';
import * as vscode from 'vscode';
import { ComponentDetails, IClientConfig, IProxyConfig, ISummaryRequestModel, IVersion, XrayClient } from 'xray-client-js';
import { GoCenterClient } from '../goCenterClient/GoCenterClient';

export class ConnectionUtils {
    private static readonly MINIMAL_XRAY_VERSION_SUPPORTED: any = semver.coerce('1.7.2.3');
    private static readonly USER_AGENT: string = 'jfrog-vscode-extension/' + require('../../../package.json').version;

    /**
     * Validate url string. Used when providing Xray server url.
     * @see vscode.InputBoxOptions.validateInput
     * @param value - Url to validate.
     * @returns string with the error description or the empty string.
     */
    public static validateUrl(value: string): string {
        if (!value) {
            return 'URL cannot be empty.';
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
     * Check if the input URL is Xray URL or JFrog platform URL.
     * @param url - The JFrog platform / Xray URL
     * @param username - Platform username
     * @param password - Platform password
     */
    public static async isPlatformUrl(url: string, username: string, password: string): Promise<boolean> {
        // If URL ends with '/xray', the URL is an Xray URL
        if (url.endsWith('/xray') || url.endsWith('/xray/')) {
            return false;
        }

        // Ping to '<url>/xray'
        url += url.endsWith('/') ? 'xray' : '/xray';
        let xrayClient: XrayClient = this.createXrayClient(url, username, password);
        return await xrayClient.system().ping();
    }

    /**
     * Check permissions and version.
     * @param xrayClient - The xray client.
     * @returns true iff success.
     */
    public static async checkConnection(url: string, username: string, password: string): Promise<boolean> {
        let xrayClient: XrayClient = ConnectionUtils.createXrayClient(url, username, password);
        try {
            await ConnectionUtils.testComponentPermission(xrayClient);
            let xrayVersion: string = await ConnectionUtils.testXrayVersion(xrayClient);
            vscode.window.showInformationMessage(xrayVersion);
        } catch (error) {
            vscode.window.showErrorMessage(error.toString(), <vscode.MessageOptions>{ modal: true });
            return Promise.resolve(false);
        }
        return Promise.resolve(true);
    }

    public static async testXrayVersion(xrayClient: XrayClient): Promise<string> {
        let xrayVersion: IVersion = await xrayClient.system().version();
        if (xrayVersion.xray_version !== 'Unknown') {
            let xraySemver: semver.SemVer = new semver.SemVer(xrayVersion.xray_version);
            if (xraySemver.compare(ConnectionUtils.MINIMAL_XRAY_VERSION_SUPPORTED) < 0) {
                return Promise.reject(
                    'Unsupported Xray version: ' +
                        xrayVersion.xray_version +
                        ', version ' +
                        ConnectionUtils.MINIMAL_XRAY_VERSION_SUPPORTED +
                        ' or above is required.'
                );
            }
        }
        return Promise.resolve('Successfully connected to Xray version: ' + xrayVersion.xray_version);
    }

    public static async testComponentPermission(xrayClient: XrayClient): Promise<any> {
        let summaryRequest: ISummaryRequestModel = {
            component_details: [new ComponentDetails('testComponent')]
        } as ISummaryRequestModel;
        try {
            await xrayClient.summary().component(summaryRequest);
        } catch (error) {
            if (!error.response) {
                return Promise.reject('Could not connect to Xray: ' + error);
            }
            let message: string = '';
            switch (error.response.status) {
                case http2.constants.HTTP_STATUS_UNAUTHORIZED:
                    message = 'Please check your credentials.';
                    break;
                case http2.constants.HTTP_STATUS_FORBIDDEN:
                    message = "Please make sure that the user has 'View Components' permission in Xray.";
                    break;
            }
            return Promise.reject(error.message + '. ' + message);
        }
        return Promise.resolve();
    }

    public static createGoCenterClient(): GoCenterClient {
        let clientConfig: IClientConfig = {
            headers: {},
            proxy: ConnectionUtils.getProxyConfig()
        } as IClientConfig;
        this.addUserAgentHeader(clientConfig);
        this.addProxyAuthHeader(clientConfig);
        return new GoCenterClient(clientConfig);
    }

    public static createXrayClient(url: string, username: string, password: string): XrayClient {
        let clientConfig: IClientConfig = {
            serverUrl: url,
            username: username,
            password: password,
            headers: {},
            proxy: ConnectionUtils.getProxyConfig()
        } as IClientConfig;
        ConnectionUtils.addUserAgentHeader(clientConfig);
        ConnectionUtils.addProxyAuthHeader(clientConfig);
        return new XrayClient(clientConfig);
    }

    public static addUserAgentHeader(clientConfig: IClientConfig) {
        clientConfig.headers!['User-Agent'] = ConnectionUtils.USER_AGENT;
    }

    public static addProxyAuthHeader(clientConfig: IClientConfig) {
        if (clientConfig.proxy) {
            let proxyAuthHeader: string | undefined = vscode.workspace.getConfiguration().get('http.proxyAuthorization');
            if (proxyAuthHeader) {
                clientConfig.headers!['Proxy-Authorization'] = proxyAuthHeader;
            }
        }
    }

    public static getProxyConfig(): IProxyConfig | boolean {
        let proxySupport: string | undefined = vscode.workspace.getConfiguration().get('http.proxySupport', 'override');
        if (proxySupport === 'off') {
            return false;
        }
        let proxyConfig: IProxyConfig = {} as IProxyConfig;
        let httpProxy: string | undefined = vscode.workspace.getConfiguration().get('http.proxy');
        if (httpProxy) {
            let proxyUri: URL = new URL(httpProxy);
            proxyConfig.protocol = proxyUri.protocol;
            proxyConfig.host = proxyUri.host;
            if (proxyUri.port) {
                proxyConfig.port = +proxyUri.port;
            }
        }
        return proxyConfig;
    }
}
