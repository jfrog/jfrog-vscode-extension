import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import * as keytar from 'keytar';
import { URL } from 'url';
import * as vscode from 'vscode';
import { ComponentDetails, IArtifact, IClientConfig, IProxyConfig, ISummaryRequestModel, ISummaryResponse, XrayClient } from 'xray-client-js';
import { ExtensionComponent } from '../extensionComponent';
import { GoCenterClient } from '../goCenterClient/GoCenterClient';
import { IComponentMetadata } from '../goCenterClient/model/ComponentMetadata';
import { IModuleResponse } from '../goCenterClient/model/ModuleResponse';
import { ConnectionUtils } from './connectionUtils';
import { LogManager } from '../log/logManager';

/**
 * Manage the Xray credentials and perform connection with Xray server.
 */
export class ConnectionManager implements ExtensionComponent {
    // The username and URL keys in VS-Code global configuration
    private static readonly XRAY_USERNAME_KEY: string = 'jfrog.xray.username';
    private static readonly XRAY_URL_KEY: string = 'jfrog.xray.url';

    // Service ID in the OS key store to store and retrieve the password
    private static readonly SERVICE_ID: string = 'com.jfrog.xray.vscode';

    // Store connection details in file system after reading connection details from env
    public static readonly STORE_CONNECTION_ENV: string = 'JFROG_IDE_STORE_CONNECTION';
    // URL, username and password environment variables keys
    public static readonly USERNAME_ENV: string = 'JFROG_IDE_USERNAME';
    public static readonly PASSWORD_ENV: string = 'JFROG_IDE_PASSWORD';
    public static readonly URL_ENV: string = 'JFROG_IDE_URL';

    private static readonly USER_AGENT: string = 'jfrog-vscode-extension/' + require('../../../package.json').version;
    private _context!: vscode.ExtensionContext;
    private _username: string = '';
    private _password: string = '';
    private _url: string = '';
    constructor(private _logManager: LogManager) {}

    public async activate(context: vscode.ExtensionContext): Promise<ConnectionManager> {
        this._context = context;
        await this.populateCredentials(false);
        this.updateConnectionIcon();
        return this;
    }

    public async connect(): Promise<boolean> {
        if (!(await this.populateCredentials(true))) {
            return Promise.resolve(false);
        }
        return await vscode.window.withProgress(
            <vscode.ProgressOptions>{ location: vscode.ProgressLocation.Window, title: 'Checking connection with Xray server...' },
            async (): Promise<boolean> => {
                let xrayClient: XrayClient = this.createXrayClient();
                if (!(await ConnectionUtils.checkConnection(xrayClient))) {
                    this.deleteCredentialFromMemory();
                    return false;
                }
                await this.storeConnection();
                this.updateConnectionIcon();
                return true;
            }
        );
    }

    public async disconnect(): Promise<boolean> {
        return await vscode.window.withProgress(
            <vscode.ProgressOptions>{ location: vscode.ProgressLocation.Window, title: 'Delete Xray connection details...' },
            async (): Promise<boolean> => {
                await this.deleteCredentialFromFileSystem();
                this.deleteCredentialFromMemory();
                this.updateConnectionIcon();
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

    public async getGoCenterModules(componentDetails: ComponentDetails[]): Promise<IComponentMetadata[]> {
        let goCenterClient: GoCenterClient = this.createGoCenterClient();
        let summaryRequest: ISummaryRequestModel = { component_details: componentDetails };
        let moduleResponse: IModuleResponse = await goCenterClient.getMetadataForModules(summaryRequest);
        return Promise.resolve(moduleResponse.components_metadata);
    }

    public areCredentialsSet(): boolean {
        return !!(this._url && this._username && this._password);
    }

    public async populateCredentials(prompt: boolean): Promise<boolean> {
        let storeCredentials: boolean = false;
        let url: string = process.env[ConnectionManager.URL_ENV] || '';
        let username: string = process.env[ConnectionManager.USERNAME_ENV] || '';
        let password: string = process.env[ConnectionManager.PASSWORD_ENV] || '';
        if (!url || !username || !password) {
            // Read credentials from file system
            url = await this.retrieveUrl(prompt);
            if (!url) {
                return Promise.resolve(false);
            }
            username = await this.retrieveUsername(prompt);
            if (!username) {
                return Promise.resolve(false);
            }
            password = await this.retrievePassword(prompt, url, username);
            if (!password) {
                return Promise.resolve(false);
            }
        } else if (process.env[ConnectionManager.STORE_CONNECTION_ENV]?.toUpperCase() === 'TRUE') {
            // Store credentials in file system if JFROG_IDE_STORE_CONNECTION environment variable is true
            storeCredentials = true;
        }

        this._url = url;
        this._username = username;
        this._password = password;
        if (storeCredentials) {
            await this.storeConnection();
        }
        return Promise.resolve(true);
    }

    private createXrayClient(): XrayClient {
        let clientConfig: IClientConfig = {
            serverUrl: this._url,
            username: this._username,
            password: this._password,
            headers: {},
            proxy: this.getProxyConfig()
        } as IClientConfig;
        this.addUserAgentHeader(clientConfig);
        this.addProxyAuthHeader(clientConfig);
        return new XrayClient(clientConfig);
    }

    private createGoCenterClient(): GoCenterClient {
        let clientConfig: IClientConfig = {
            headers: {},
            proxy: this.getProxyConfig()
        } as IClientConfig;
        this.addUserAgentHeader(clientConfig);
        this.addProxyAuthHeader(clientConfig);
        return new GoCenterClient(clientConfig);
    }

    private async retrieveUrl(prompt: boolean): Promise<string> {
        let url: string = (await this._context.globalState.get(ConnectionManager.XRAY_URL_KEY)) || '';
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
        await this._context.globalState.update(ConnectionManager.XRAY_URL_KEY, this._url);
    }

    private async retrieveUsername(prompt: boolean): Promise<string> {
        let username: string = (await this._context.globalState.get(ConnectionManager.XRAY_USERNAME_KEY)) || '';
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
        await this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, this._username);
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

    private updateConnectionIcon() {
        vscode.commands.executeCommand('setContext', 'areCredentialsSet', this.areCredentialsSet());
    }

    public addUserAgentHeader(clientConfig: IClientConfig) {
        clientConfig.headers!['User-Agent'] = ConnectionManager.USER_AGENT;
    }

    public addProxyAuthHeader(clientConfig: IClientConfig) {
        if (clientConfig.proxy) {
            let proxyAuthHeader: string | undefined = vscode.workspace.getConfiguration().get('http.proxyAuthorization');
            if (proxyAuthHeader) {
                clientConfig.headers!['Proxy-Authorization'] = proxyAuthHeader;
            }
        }
    }

    /**
     * Store Xray URL and username in VS-Code global state.
     * Store Xray password in Keychain.
     */
    private async storeConnection(): Promise<void> {
        await this.storeUrl();
        await this.storeUsername();
        await this.storePassword();
    }

    private deleteCredentialFromMemory() {
        this._password = '';
        this._username = '';
        this._url = '';
    }

    private async deleteCredentialFromFileSystem(): Promise<boolean> {
        // Delete password must be executed first. in order to find the password in he key chain, we must create its hash key using the url & username.
        let ok: boolean = await keytar.deletePassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._url, this._username));
        if (!ok) {
            this._logManager.logMessage('Failed to delete the password from the system password manager', 'WARN');
            return false;
        }
        // Setting the value to undefined will remove the key https://github.com/microsoft/vscode/issues/11528
        await Promise.all([
            await this._context.globalState.update(ConnectionManager.XRAY_URL_KEY, undefined),
            await this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, undefined)
        ]);
        return true;
    }
}
