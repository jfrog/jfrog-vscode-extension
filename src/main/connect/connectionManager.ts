import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import * as keytar from 'keytar';
import * as vscode from 'vscode';
import { ComponentDetails, IArtifact, ISummaryRequestModel, ISummaryResponse, XrayClient } from 'xray-client-js';
import { ExtensionComponent } from '../extensionComponent';
import { GoCenterClient } from '../goCenterClient/GoCenterClient';
import { IComponentMetadata } from '../goCenterClient/model/ComponentMetadata';
import { IModuleResponse } from '../goCenterClient/model/ModuleResponse';
import { LogManager } from '../log/logManager';
import { ConnectionUtils } from './connectionUtils';

/**
 * Manage the Xray credentials and perform connection with Xray server.
 */
export class ConnectionManager implements ExtensionComponent {
    // The username and URL keys in VS-Code global configuration
    private static readonly XRAY_USERNAME_KEY: string = 'jfrog.xray.username';
    private static readonly PLATFORM_URL_KEY: string = 'jfrog.xray.platformUrl';
    private static readonly XRAY_URL_KEY: string = 'jfrog.xray.url';

    // Service ID in the OS key store to store and retrieve the password
    private static readonly SERVICE_ID: string = 'com.jfrog.xray.vscode';

    // Store connection details in file system after reading connection details from env
    public static readonly STORE_CONNECTION_ENV: string = 'JFROG_IDE_STORE_CONNECTION';
    // URL, username and password environment variables keys
    public static readonly USERNAME_ENV: string = 'JFROG_IDE_USERNAME';
    public static readonly PASSWORD_ENV: string = 'JFROG_IDE_PASSWORD';
    public static readonly URL_ENV: string = 'JFROG_IDE_URL';

    private _context!: vscode.ExtensionContext;
    private _username: string = '';
    private _password: string = '';
    private _xrayUrl: string = '';
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
                if (await ConnectionUtils.checkConnection(this._xrayUrl, this._username, this._password)) {
                    await this.storeConnection();
                    this.updateConnectionIcon();
                    return true;
                }
                this.deleteCredentialFromMemory();
                return false;
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
        let xrayClient: XrayClient = ConnectionUtils.createXrayClient(this._xrayUrl, this._username, this._password);
        let summaryRequest: ISummaryRequestModel = { component_details: componentDetails };
        let summaryResponse: ISummaryResponse = await xrayClient.summary().component(summaryRequest);
        return Promise.resolve(summaryResponse.artifacts);
    }

    public async getGoCenterModules(componentDetails: ComponentDetails[]): Promise<IComponentMetadata[]> {
        let goCenterClient: GoCenterClient = ConnectionUtils.createGoCenterClient();
        let summaryRequest: ISummaryRequestModel = { component_details: componentDetails };
        let moduleResponse: IModuleResponse = await goCenterClient.getMetadataForModules(summaryRequest);
        return Promise.resolve(moduleResponse.components_metadata);
    }

    public areCredentialsSet(): boolean {
        return !!((this._url || this._xrayUrl) && this._username && this._password);
    }

    /**
     * Populate credentials from environment variable or from the global storage.
     * @param prompt - True if should prompt
     * @returns true if the credentials populates
     */
    public async populateCredentials(prompt: boolean): Promise<boolean> {
        let storeCredentials: boolean = false;
        this.readCredentialsFromEnv();
        let credentialsSet: boolean = this.areCredentialsSet();
        if (!this.areCredentialsSet()) {
            // Read credentials from file system
            if ((await this.setUrls(prompt)) && (await this.setUsername(prompt)) && (await this.setPassword(prompt))) {
                credentialsSet = true;
            }
        } else if (process.env[ConnectionManager.STORE_CONNECTION_ENV]?.toUpperCase() === 'TRUE') {
            // Store credentials in file system if JFROG_IDE_STORE_CONNECTION environment variable is true
            storeCredentials = true;
        }

        if (!credentialsSet) {
            this.deleteCredentialFromMemory();
            return false;
        }
        await this.resolveUrls();
        if (storeCredentials) {
            await this.storeConnection();
        }
        return true;
    }

    public get url() {
        return this._url;
    }

    public get xrayUrl() {
        return this._xrayUrl;
    }

    public get username() {
        return this._username;
    }

    public get password() {
        return this._password;
    }

    /**
     * Resolve Xray and JFrog platform URLs from the input url.
     * If URL is <platform-url>, the derived Xray URL is <platform-url/xray>.
     * If URL is <platform-url>/xray the derived Xray platform URL is <platform-url>.
     * If URL leads to an Xray URL not under JFrog platform (like in Artifactory 6), leave the derive platform URL empty.
     */
    private async resolveUrls() {
        if (await ConnectionUtils.isPlatformUrl(this._url, this._username, this._password)) {
            // _url is a platform URL
            this._xrayUrl = this._url.endsWith('/') ? this._url + 'xray' : this._url + '/xray';
        } else {
            // _url is an Xray URL
            this._xrayUrl = this._url;
            if (this._url.endsWith('/xray') || this._url.endsWith('/xray/')) {
                this._url = this._url.substr(0, this._url.lastIndexOf('/xray'));
            } else {
                this._url = '';
            }
        }
        this._logManager.logMessage('Resolved JFrog platform URL: ' + this._url, 'DEBUG');
        this._logManager.logMessage('Resolved Xray URL: ' + this._xrayUrl, 'DEBUG');
    }

    private readCredentialsFromEnv() {
        this._url = process.env[ConnectionManager.URL_ENV] || '';
        this._username = process.env[ConnectionManager.USERNAME_ENV] || '';
        this._password = process.env[ConnectionManager.PASSWORD_ENV] || '';
    }

    private async setUrls(prompt: boolean): Promise<boolean> {
        if (prompt) {
            this._url =
                (await vscode.window.showInputBox({
                    prompt: 'Enter JFrog Platform URL',
                    value: this._url,
                    ignoreFocusOut: true,
                    placeHolder: 'Example: https://acme.jfrog.io',
                    validateInput: ConnectionUtils.validateUrl
                })) || '';
            return !!this._url;
        } else {
            this._url = (await this._context.globalState.get(ConnectionManager.PLATFORM_URL_KEY)) || '';
            this._xrayUrl = (await this._context.globalState.get(ConnectionManager.XRAY_URL_KEY)) || '';
        }
        return !!this._url || !!this._xrayUrl;
    }

    private async storePlatformUrl() {
        await this._context.globalState.update(ConnectionManager.PLATFORM_URL_KEY, this._url);
    }

    private async storeUrl() {
        await this._context.globalState.update(ConnectionManager.XRAY_URL_KEY, this._xrayUrl);
    }

    private async setUsername(prompt: boolean): Promise<boolean> {
        if (prompt) {
            this._username =
                (await vscode.window.showInputBox({
                    prompt: 'Enter username',
                    value: this._username,
                    ignoreFocusOut: true,
                    validateInput: ConnectionUtils.validateFieldNotEmpty
                })) || '';
        } else {
            this._username = (await this._context.globalState.get(ConnectionManager.XRAY_USERNAME_KEY)) || '';
        }
        return !!this._username;
    }

    private async storeUsername() {
        await this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, this._username);
    }

    private async setPassword(prompt: boolean): Promise<boolean> {
        if (prompt) {
            this._password =
                (await vscode.window.showInputBox({
                    prompt: 'Enter password',
                    password: true,
                    ignoreFocusOut: true,
                    validateInput: ConnectionUtils.validateFieldNotEmpty
                })) || '';
        } else {
            this._password =
                (await keytar.getPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._url, this._username))) ||
                (await keytar.getPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._xrayUrl, this._username))) ||
                '';
        }
        return !!this._password;
    }

    private async storePassword() {
        await keytar.setPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._xrayUrl, this._username), this._password);
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

    private updateConnectionIcon() {
        vscode.commands.executeCommand('setContext', 'areCredentialsSet', this.areCredentialsSet());
    }

    /**
     * Store Xray URL and username in VS-Code global state.
     * Store Xray password in Keychain.
     */
    private async storeConnection(): Promise<void> {
        await this.storeUrl();
        await this.storePlatformUrl();
        await this.storeUsername();
        await this.storePassword();
    }

    private deleteCredentialFromMemory() {
        this._password = '';
        this._username = '';
        this._url = '';
        this._xrayUrl = '';
    }

    private async deleteCredentialFromFileSystem(): Promise<boolean> {
        // Delete password must be executed first. in order to find the password in the key chain, we must create its hash key using the url & username.
        let ok: boolean = await keytar.deletePassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._xrayUrl, this._username));
        if (!ok) {
            this._logManager.logMessage('Failed to delete the password from the system password manager', 'WARN');
            return false;
        }
        await Promise.all([
            this._context.globalState.update(ConnectionManager.XRAY_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.PLATFORM_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, undefined)
        ]);
        return true;
    }
}
