import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import * as keytar from 'keytar';
import * as vscode from 'vscode';
import {
    ComponentDetails,
    IAqlSearchResult,
    IArtifact,
    IDetailsResponse,
    ISummaryRequestModel,
    ISummaryResponse, JfrogClient
} from 'jfrog-client-js';
import { ExtensionComponent } from '../extensionComponent';
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
    private static readonly RT_URL_KEY: string = 'jfrog.rt.url';

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
    private _rtUrl: string = '';
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
                this.deleteCredentialsFromMemory();
                return false;
            }
        );
    }

    public async disconnect(): Promise<boolean> {
        return await vscode.window.withProgress(
            <vscode.ProgressOptions>{ location: vscode.ProgressLocation.Window, title: 'Delete Xray connection details...' },
            async (): Promise<boolean> => {
                await this.deleteCredentialFromFileSystem();
                this.deleteCredentialsFromMemory();
                this.updateConnectionIcon();
                return true;
            }
        );
    }

    public async getComponents(componentDetails: ComponentDetails[]): Promise<IArtifact[]> {
        if (!this.areXrayCredentialsSet()) {
            await this.populateCredentials(false);
        }
        let summaryRequest: ISummaryRequestModel = { component_details: componentDetails };
        let summaryResponse: ISummaryResponse = await this.createJfrogClient().xray().summary().component(summaryRequest);
        return Promise.resolve(summaryResponse.artifacts);
    }

    public areXrayCredentialsSet(): boolean {
        return !!((this._url || this._xrayUrl) && this._username && this._password);
    }

    public areAllCredentialsSet(): boolean {
        return !!((this._url || (this._xrayUrl && this._rtUrl)) && this._username && this._password);
    }

    /**
     * Populate credentials from environment variable or from the global storage.
     * @param prompt - True if should prompt
     * @returns true if the credentials populates
     */
    public async populateCredentials(prompt: boolean): Promise<boolean> {
        let storeCredentials: boolean = false;
        this.readCredentialsFromEnv();
        let credentialsSet: boolean = this.areAllCredentialsSet();
        if (!credentialsSet) {
            // Read credentials from file system
            if ((await this.setUrls(prompt)) && (await this.setUsername(prompt)) && (await this.setPassword(prompt))) {
                credentialsSet = true;
            }
        } else if (process.env[ConnectionManager.STORE_CONNECTION_ENV]?.toUpperCase() === 'TRUE') {
            // Store credentials in file system if JFROG_IDE_STORE_CONNECTION environment variable is true
            storeCredentials = true;
        }

        if (!credentialsSet) {
            this.deleteCredentialsFromMemory();
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
     * If URL is <platform-url>, the derived Xray URL is <platform-url/xray>, and the Artifactory URL is <platform-url/artifactory>.
     * If URL is <platform-url>/xray the derived platform URL is <platform-url>.
     * If URL leads to an Xray URL not under JFrog platform (like in Artifactory 6), leave the derive platform URL empty.
     */
    /*
    private async resolveUrlsForBackwardCompatibility() {
        // If only url is set, try resolving other urls for backward compatibility. 
        if (!this._url || !!this._xrayUrl || !!this._rtUrl) {
            return;
        }

        if (this._url.endsWith('/xray') || this._url.endsWith('/xray/')) {
            this._xrayUrl = this._url;
            this._url = this._url.substr(0, this._url.lastIndexOf('/xray'));
        } else {
            this._url = '';
        }
        if (!!this._url) {
            this._rtUrl = this.getRtUrlFromPlatform(this._url);
        }
    }
*/
    // todo remove
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

    /* // todo
    private async validateUrls(): Promise<boolean> {
        if (await ConnectionUtils.validateXrayConnection(this._xrayUrl, this._username, this._password)) {
            this._logManager.logMessage('Resolved Xray URL: ' + this._xrayUrl, 'DEBUG');
        }
        if (await ConnectionUtils.validateArtifactoryConnection(this._rtUrl, this._username, this._password)) {
            this._logManager.logMessage('Resolved Artifactory URL: ' + this._rtUrl, 'DEBUG');
        }
    }
*/
    private getServiceUrlFromPlatform(platformUrl: string, service: string): string {
        platformUrl += platformUrl.endsWith('/') ? '' : '/';
        return platformUrl + service;
    }

    private getRtUrlFromPlatform(platformUrl: string): string {
        return this.getServiceUrlFromPlatform(platformUrl, 'artifactory');
    }

    private getXrayUrlFromPlatform(platformUrl: string): string {
        return this.getServiceUrlFromPlatform(platformUrl, 'xray');
    }

    private readCredentialsFromEnv() {
        this._url = process.env[ConnectionManager.URL_ENV] || '';
        this._username = process.env[ConnectionManager.USERNAME_ENV] || '';
        this._password = process.env[ConnectionManager.PASSWORD_ENV] || '';
    }

    private async setUrls(prompt: boolean): Promise<boolean> {
        if (!prompt) {
            this._url = (await this._context.globalState.get(ConnectionManager.PLATFORM_URL_KEY)) || '';
            this._xrayUrl = (await this._context.globalState.get(ConnectionManager.XRAY_URL_KEY)) || '';
            this._rtUrl = (await this._context.globalState.get(ConnectionManager.RT_URL_KEY)) || '';
            return !!this._url || !!this._xrayUrl;
        }
        if (await this.promptPlatformUrl()) {
            this._rtUrl = await this.promptServiceUrl('Artifactory', this.getRtUrlFromPlatform(this._url));
            if (!!this._rtUrl) {
                this._xrayUrl = await this.promptServiceUrl('Xray', this.getXrayUrlFromPlatform(this._url));
                return !!this._xrayUrl;
            }
        }
        return false;
    }

    private async promptPlatformUrl(): Promise<boolean> {
        this._url =
            (await vscode.window.showInputBox({
                prompt: 'Enter JFrog Platform URL',
                value: this._url,
                ignoreFocusOut: true,
                placeHolder: 'Example: https://acme.jfrog.io',
                validateInput: ConnectionUtils.validateUrl
            })) || '';
        return !!this._url;
    }

    private async promptServiceUrl(type: string, suggestedUrl: string): Promise<string> {
        return (
            (await vscode.window.showInputBox({
                prompt: 'Enter JFrog ' + type + ' URL',
                value: suggestedUrl,
                ignoreFocusOut: true,
                validateInput: ConnectionUtils.validateUrl
            })) || ''
        );
    }

    private async storePlatformUrl() {
        await this._context.globalState.update(ConnectionManager.PLATFORM_URL_KEY, this._url);
    }

    private async storeXrayUrl() {
        await this._context.globalState.update(ConnectionManager.XRAY_URL_KEY, this._xrayUrl);
    }

    private async storeRtUrl() {
        await this._context.globalState.update(ConnectionManager.RT_URL_KEY, this._rtUrl);
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
        vscode.commands.executeCommand('setContext', 'areCredentialsSet', this.areXrayCredentialsSet());
    }

    /**
     * Store URLs and username in VS-Code global state.
     * Store Xray password in Keychain.
     */
    private async storeConnection(): Promise<void> {
        await this.storeXrayUrl();
        await this.storeRtUrl();
        await this.storePlatformUrl();
        await this.storeUsername();
        await this.storePassword();
    }

    private deleteCredentialsFromMemory() {
        this._password = '';
        this._username = '';
        this._url = '';
        this._xrayUrl = '';
        this._rtUrl = '';
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

    public async searchArtifactsByAql(aql: string): Promise<IAqlSearchResult> {
        return this.createJfrogClient().artifactory().search().aqlSearch(aql);
    }

    public async downloadArtifact(artifactPath: string): Promise<string> {
        return this.createJfrogClient().artifactory().download().downloadArtifact(artifactPath);
    }

    public async downloadBuildDetails(buildName: string, buildNumber: string): Promise<IDetailsResponse> {
        return this.createJfrogClient().xray().details().build(buildName, buildNumber);
    }

    public createJfrogClient(): JfrogClient {
        return ConnectionUtils.createJfrogClient(this._url, this._rtUrl, this._xrayUrl, this._username, this._password);
    }
}
