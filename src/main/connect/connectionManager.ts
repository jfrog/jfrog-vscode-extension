import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import * as keytar from 'keytar';
import { URL } from 'url';
import * as vscode from 'vscode';
import { ComponentDetails, IArtifact, IClientConfig, IProxyConfig, ISummaryRequestModel, ISummaryResponse, XrayClient } from 'xray-client-js';
import { ExtensionComponent } from '../extensionComponent';
import { ConnectionUtils } from './connectionUtils';

/**
 * Manage the Xray credentials and perform connection with Xray server.
 */
export class ConnectionManager implements ExtensionComponent {
    private static readonly XRAY_URL_USERNAME: string = 'jfrog.xray.username';
    private static readonly SERVICE_ID: string = 'com.jfrog.xray.vscode';
    private static readonly XRAY_URL_KEY: string = 'jfrog.xray.url';
    private _username: string = '';
    private _password: string = '';
    private _url: string = '';

    public async activate(context: vscode.ExtensionContext): Promise<ConnectionManager> {
        await this.populateCredentials(false);
        return this;
    }

    public async connect(): Promise<boolean> {
        if (!(await this.populateCredentials(true))) {
            return Promise.resolve(false);
        }
        return await vscode.window.withProgress(
            <vscode.ProgressOptions>{ location: vscode.ProgressLocation.Window, title: 'Checking connection with Xray server...' },
            async () => {
                let xrayClient: XrayClient = this.createXrayClient();
                if (!(await ConnectionUtils.checkConnection(xrayClient))) {
                    return false;
                }
                await this.storeUrl();
                await this.storeUsername();
                await this.storePassword();
                return true;
            }
        );
    }

    public async getComponents(componentDetails: ComponentDetails[]): Promise<IArtifact[]> {
        if (!this.areCredentialsSet()) {
            await this.populateCredentials(false);
        }
        let xrayClient: XrayClient = this.createXrayClient();
        let summaryRequest: ISummaryRequestModel = { component_details: componentDetails };
        let summaryResponse: ISummaryResponse = await xrayClient.summary().component(summaryRequest);
        return Promise.resolve(summaryResponse.artifacts);
    }

    public areCredentialsSet(): boolean {
        return !!(this._url && this._username && this._password);
    }

    private async populateCredentials(prompt: boolean) {
        let url: string = await this.retrieveUrl(prompt);
        if (!url) {
            return Promise.resolve(false);
        }
        let username: string = await this.retrieveUsername(prompt);
        if (!username) {
            return Promise.resolve(false);
        }
        let password: string = await this.retrievePassword(prompt, url, username);
        if (!password) {
            return Promise.resolve(false);
        }
        this._url = url;
        this._username = username;
        this._password = password;
        return Promise.resolve(true);
    }

    private createXrayClient(): XrayClient {
        let clientConfig: IClientConfig = {
            serverUrl: this._url,
            username: this._username,
            password: this._password,
            proxy: this.getProxyConfig()
        } as IClientConfig;
        this.addProxyAuthHeader(clientConfig);
        return new XrayClient(clientConfig);
    }

    private async retrieveUrl(prompt: boolean): Promise<string> {
        let url: string = (await vscode.workspace.getConfiguration().get(ConnectionManager.XRAY_URL_KEY)) || '';
        if (prompt) {
            url =
                (await vscode.window.showInputBox({
                    prompt: 'Enter Xray url',
                    value: this._url ? this._url : 'https://',
                    ignoreFocusOut: true,
                    validateInput: ConnectionUtils.validateUrl
                })) || '';
        }
        return Promise.resolve(url);
    }

    private async storeUrl() {
        await vscode.workspace.getConfiguration().update(ConnectionManager.XRAY_URL_KEY, this._url, vscode.ConfigurationTarget.Global);
    }

    private async retrieveUsername(prompt: boolean): Promise<string> {
        let username: string = (await vscode.workspace.getConfiguration().get(ConnectionManager.XRAY_URL_USERNAME)) || '';
        if (prompt) {
            username =
                (await vscode.window.showInputBox({
                    prompt: 'Enter Xray username',
                    value: this._username,
                    ignoreFocusOut: true,
                    validateInput: ConnectionUtils.validateFieldNotEmpty
                })) || '';
        }
        return Promise.resolve(username);
    }

    private async storeUsername() {
        await vscode.workspace.getConfiguration().update(ConnectionManager.XRAY_URL_USERNAME, this._username, vscode.ConfigurationTarget.Global);
    }

    private async retrievePassword(prompt: boolean, url: string, username: string): Promise<string> {
        let password: string = (await keytar.getPassword(ConnectionManager.SERVICE_ID, this.createAccountId(url, username))) || '';
        if (prompt) {
            password =
                (await vscode.window.showInputBox({
                    prompt: 'Enter Xray password',
                    password: true,
                    ignoreFocusOut: true,
                    validateInput: ConnectionUtils.validateFieldNotEmpty
                })) || '';
        }
        return Promise.resolve(password);
    }

    private async storePassword() {
        await keytar.setPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._url, this._username), this._password);
    }

    /**
     * Create obscured account id to get extra security.
     * @param url Xray url
     * @param username Xray username
     * @returns hashed account id
     */
    private createAccountId(url: string, username: string): string {
        return crypto
            .createHash('sha256')
            .update(url + username)
            .digest('hex');
    }

    private getProxyConfig(): IProxyConfig | boolean {
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

    private addProxyAuthHeader(clientConfig: IClientConfig) {
        if (clientConfig.proxy) {
            let proxyAuthHeader: string | undefined = vscode.workspace.getConfiguration().get('http.proxyAuthorization');
            if (proxyAuthHeader) {
                clientConfig.headers = { 'Proxy-Authorization': proxyAuthHeader };
            }
        }
    }
}
