import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods
import * as keytar from 'keytar';
import * as vscode from 'vscode';
import {
    ComponentDetails,
    IAqlSearchResult,
    IArtifact,
    IDetailsResponse,
    ISummaryRequestModel,
    ISummaryResponse,
    JfrogClient
} from 'jfrog-client-js';
import { ExtensionComponent } from '../extensionComponent';
import { LogManager } from '../log/logManager';
import { ConnectionUtils } from './connectionUtils';
import { execSync } from 'child_process';
import * as semver from 'semver';

/**
 * Manage the Xray credentials and perform connection with Xray server.
 */
export class ConnectionManager implements ExtensionComponent {
    // The username and URL keys in VS-Code global configuration
    private static readonly XRAY_USERNAME_KEY: string = 'jfrog.xray.username';
    private static readonly PLATFORM_URL_KEY: string = 'jfrog.xray.platformUrl';
    private static readonly XRAY_URL_KEY: string = 'jfrog.xray.url';
    private static readonly RT_URL_KEY: string = 'jfrog.rt.url';

    // Service ID in the OS key store to store and retrieve the password / access token
    private static readonly SERVICE_ID: string = 'com.jfrog.xray.vscode';
    // Key used for uniqueness when storing access token in filesystem.
    private static readonly ACCESS_TOKEN_FS_KEY: string = 'vscode_jfrog_token';

    // Store connection details in file system after reading connection details from env
    public static readonly STORE_CONNECTION_ENV: string = 'JFROG_IDE_STORE_CONNECTION';
    // URL and credentials environment variables keys
    public static readonly USERNAME_ENV: string = 'JFROG_IDE_USERNAME';
    public static readonly PASSWORD_ENV: string = 'JFROG_IDE_PASSWORD';
    public static readonly ACCESS_TOKEN_ENV: string = 'JFROG_IDE_ACCESS_TOKEN';
    public static readonly URL_ENV: string = 'JFROG_IDE_URL';

    // Minimal version supporting exporting default server configuration.
    private static readonly MINIMAL_JFROG_CLI_VERSION_FOR_DEFAULT_EXPORT: any = semver.coerce('2.6.1');

    private _context!: vscode.ExtensionContext;
    private _username: string = '';
    private _password: string = '';
    private _accessToken: string = '';
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
                if (await ConnectionUtils.checkXrayConnectionAndPermissions(this._xrayUrl, this._username, this._password, this._accessToken)) {
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
        let summaryResponse: ISummaryResponse = await this.createJfrogClient()
            .xray()
            .summary()
            .component(summaryRequest);
        return Promise.resolve(summaryResponse.artifacts);
    }

    public areXrayCredentialsSet(): boolean {
        return !!((this._url || this._xrayUrl) && ((this._username && this._password) || this._accessToken));
    }

    public areCompleteCredentialsSet(): boolean {
        return !!(this._url && this._xrayUrl && this._rtUrl && ((this._username && this._password) || this._accessToken));
    }

    /**
     * Populate credentials from environment variable or from the global storage.
     * @param prompt - True if should prompt
     * @returns true if the credentials populates
     */
    public async populateCredentials(prompt: boolean): Promise<boolean> {
        let storeCredentials: boolean = false;
        this.readCredentialsFromEnv();
        let credentialsSet: boolean = this.areXrayCredentialsSet();
        if (!credentialsSet) {
            credentialsSet = await this.setCredentialsOrPrompt(prompt);
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

    public async setCredentialsOrPrompt(prompt: boolean): Promise<boolean> {
        // Read credentials from file system. Expecting URLs, username & password or access token.
        if (
            (await this.setUrlsFromFilesystem()) &&
            (((await this.setUsernameFromFilesystem()) && (await this.setPasswordFromFilesystem())) || (await this.setAccessTokenFromFilesystem()))
        ) {
            return true;
        }

        if (await this.readCredentialsFromJfrogCli()) {
            return true;
        }

        if (prompt) {
            return await this.promptAll();
        }
        return false;
    }

    private async promptAll(): Promise<boolean> {
        if (!(await this.promptUrls())) {
            return false;
        }
        if (await this.promptAccessToken()) {
            return true;
        }
        return (await this.promptUsername()) && (await this.promptPassword());
    }

    public async readCredentialsFromJfrogCli(): Promise<boolean> {
        if (!(await this.verifyJfrogCliInstalledAndVersion())) {
            return false;
        }
        return await this.getJfrogCliDefaultServerConfiguration();
    }

    private async verifyJfrogCliInstalledAndVersion(): Promise<boolean> {
        try {
            let version: string = await this.getJfrogCliVersion();
            if (!version) {
                return false;
            }

            let cliSemver: semver.SemVer = new semver.SemVer(version);
            if (cliSemver.compare(ConnectionManager.MINIMAL_JFROG_CLI_VERSION_FOR_DEFAULT_EXPORT) < 0) {
                this._logManager.logMessage(
                    'JFrog CLI version is too low to support credentials extraction (needed: ' +
                        ConnectionManager.MINIMAL_JFROG_CLI_VERSION_FOR_DEFAULT_EXPORT +
                        ', actual: ' +
                        version +
                        ')',
                    'DEBUG'
                );
                return false;
            }
        } catch (error) {
            return false;
        }
        return true;
    }

    private async getJfrogCliVersion(): Promise<string> {
        const versionPrefix: string = 'jfrog version ';
        let output: string = execSync('jf -v').toString();
        if (!output.startsWith(versionPrefix)) {
            this._logManager.logMessage('Unexpected output to JFrog CLI version command: ' + output, 'DEBUG');
            return '';
        }
        return output.replace(versionPrefix, '').trim();
    }

    private async getJfrogCliDefaultServerConfiguration(): Promise<boolean> {
        try {
            let output: string = execSync('jf c export').toString();
            let confStr: string = Buffer.from(output, 'base64').toString('ascii');
            let conf: any = JSON.parse(confStr);

            this._url = conf['url'] || '';
            this._xrayUrl = conf['xrayUrl'] || '';
            this._rtUrl = conf['artifactoryUrl'] || '';

            // Get access token if exists without refresh token. Get username & password otherwise.
            let accessToken: string = conf['accessToken'] || '';
            let refreshToken: string = conf['refreshToken'] || '';
            if (accessToken !== '' && refreshToken === '') {
                this._accessToken = accessToken;
            } else {
                this._username = conf['user'] || '';
                this._password = conf['password'] || '';
            }

            if (this.areCompleteCredentialsSet()) {
                this._logManager.logMessage('Successfuly obtained credentials from JFrog CLI', 'DEBUG');
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    public get url() {
        return this._url;
    }

    public get xrayUrl() {
        return this._xrayUrl;
    }

    public get rtUrl() {
        return this._rtUrl;
    }

    public get username() {
        return this._username;
    }

    public get password() {
        return this._password;
    }

    public get accessToken() {
        return this._accessToken;
    }

    /**
     * Resolve Xray and JFrog platform URLs from the input url.
     * If URL is <platform-url>, the derived Xray URL is <platform-url/xray>, and the Artifactory URL is <platform-url/artifactory>.
     * If URL is <platform-url>/xray the derived platform URL is <platform-url>.
     * If URL leads to an Xray URL not under JFrog platform (like in Artifactory 6), leave the derive platform URL empty.
     */
    private async resolveUrls() {
        if (await ConnectionUtils.isPlatformUrl(this._url, this._username, this._password, this._accessToken)) {
            // _url is a platform URL
            this._xrayUrl = this.getXrayUrlFromPlatform();
            this._rtUrl = this.getRtUrlFromPlatform();
        } else if (this._url) {
            // _url is an Xray URL
            this._xrayUrl = this._url;
            if (this._url.endsWith('/xray') || this._url.endsWith('/xray/')) {
                // Assuming platform URL was extracted. Checking against Artifactory.
                this._url = this._url.substr(0, this._url.lastIndexOf('/xray'));
                this._rtUrl = this.getRtUrlFromPlatform();
                if (!(await ConnectionUtils.validateArtifactoryConnection(this._rtUrl, this._username, this._password, this._accessToken))) {
                    this._url = '';
                    this._rtUrl = '';
                }
            } else {
                this._url = '';
                this._rtUrl = '';
            }
        }
        this._logManager.logMessage('Resolved JFrog platform URL: ' + this._url, 'DEBUG');
        this._logManager.logMessage('Resolved Xray URL: ' + this._xrayUrl, 'DEBUG');
        this._logManager.logMessage('Resolved Artifactory URL: ' + this._rtUrl, 'DEBUG');
    }

    private getServiceUrlFromPlatform(platformUrl: string, service: string): string {
        platformUrl += platformUrl.endsWith('/') ? '' : '/';
        return platformUrl + service;
    }

    private getRtUrlFromPlatform(): string {
        return this.getServiceUrlFromPlatform(this._url, 'artifactory');
    }

    private getXrayUrlFromPlatform(): string {
        return this.getServiceUrlFromPlatform(this._url, 'xray');
    }

    private readCredentialsFromEnv() {
        this._url = process.env[ConnectionManager.URL_ENV] || '';
        this._username = process.env[ConnectionManager.USERNAME_ENV] || '';
        this._password = process.env[ConnectionManager.PASSWORD_ENV] || '';
        this._accessToken = process.env[ConnectionManager.ACCESS_TOKEN_ENV] || '';
    }

    private async setUrlsFromFilesystem(): Promise<boolean> {
        this._url = (await this._context.globalState.get(ConnectionManager.PLATFORM_URL_KEY)) || '';
        this._xrayUrl = (await this._context.globalState.get(ConnectionManager.XRAY_URL_KEY)) || '';
        this._rtUrl = (await this._context.globalState.get(ConnectionManager.RT_URL_KEY)) || '';
        return !!this._url || !!this._xrayUrl;
    }

    private async promptUrls(): Promise<boolean> {
        await this.promptPlatformUrl();
        await this.promptArtifactoryUrl();
        await this.promptXrayUrl();
        return !!this._xrayUrl;
    }

    private async promptPlatformUrl(): Promise<boolean> {
        this._url =
            (await vscode.window.showInputBox({
                prompt: 'Enter JFrog Platform URL',
                value: this._url,
                ignoreFocusOut: true,
                placeHolder: 'Example: https://acme.jfrog.io (Leave empty to configure Xray and Artifactory separately)',
                validateInput: ConnectionUtils.validateUrl
            })) || '';
        return !!this._url;
    }

    private async promptArtifactoryUrl(): Promise<boolean> {
        this._rtUrl =
            (await vscode.window.showInputBox({
                prompt: 'Enter JFrog Artifactory URL',
                value: this._url ? this.getRtUrlFromPlatform() : '',
                ignoreFocusOut: true,
                placeHolder: "Example: https://acme.jfrog.io/artifactory (Leave empty if you'e like to use only local Xray scans)",
                validateInput: ConnectionUtils.validateUrl
            })) || '';
        return !!this._rtUrl;
    }

    private async promptXrayUrl(): Promise<boolean> {
        this._xrayUrl =
            (await vscode.window.showInputBox({
                prompt: 'Enter JFrog Xray URL',
                value: this._url ? this.getXrayUrlFromPlatform() : '',
                ignoreFocusOut: true,
                validateInput: ConnectionUtils.validateXrayUrl
            })) || '';
        return !!this._xrayUrl;
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

    private async setUsernameFromFilesystem(): Promise<boolean> {
        this._username = (await this._context.globalState.get(ConnectionManager.XRAY_USERNAME_KEY)) || '';
        return !!this._username;
    }

    private async promptUsername(): Promise<boolean> {
        this._username =
            (await vscode.window.showInputBox({
                prompt: 'Enter username',
                value: this._username,
                ignoreFocusOut: true,
                validateInput: ConnectionUtils.validateFieldNotEmpty
            })) || '';
        return !!this._username;
    }

    private async storeUsername() {
        await this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, this._username);
    }

    private async setPasswordFromFilesystem(): Promise<boolean> {
        this._password = await this.getSecretFromFilesystem(this._username);
        return !!this._password;
    }

    private async setAccessTokenFromFilesystem(): Promise<boolean> {
        this._accessToken = await this.getSecretFromFilesystem(ConnectionManager.ACCESS_TOKEN_FS_KEY);
        return !!this._accessToken;
    }

    // Password and access token are saved in keychain with an account that is a hash of url and another string.
    // For password - username, access token - a constant.
    private async getSecretFromFilesystem(keyPair: string): Promise<string> {
        return (
            (await keytar.getPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._url, keyPair))) ||
            (await keytar.getPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._xrayUrl, keyPair))) ||
            ''
        );
    }

    private async deletePasswordFromFilesystem(): Promise<boolean> {
        if (!this._password) {
            return true;
        }
        return await this.deleteSecretFromFilesystem(this._username, 'password');
    }

    private async deleteAccessTokenFromFilesystem(): Promise<boolean> {
        if (!this._accessToken) {
            return true;
        }
        return await this.deleteSecretFromFilesystem(ConnectionManager.ACCESS_TOKEN_FS_KEY, 'access token');
    }

    private async deleteSecretFromFilesystem(keyPair: string, secretName: string): Promise<boolean> {
        let ok: boolean = await keytar.deletePassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._xrayUrl, keyPair));
        if (!ok) {
            this._logManager.logMessage('Failed to delete the ' + secretName + ' from the system secrets manager', 'WARN');
            return false;
        }
        return true;
    }

    private async promptPassword(): Promise<boolean> {
        this._password =
            (await vscode.window.showInputBox({
                prompt: 'Enter password',
                password: true,
                ignoreFocusOut: true,
                validateInput: ConnectionUtils.validateFieldNotEmpty
            })) || '';
        return !!this._password;
    }

    private async storePassword() {
        if (!this._password) {
            return;
        }
        await keytar.setPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._xrayUrl, this._username), this._password);
    }

    private async promptAccessToken(): Promise<boolean> {
        this._accessToken =
            (await vscode.window.showInputBox({
                prompt: 'Enter JFrog access token (Leave blank for username and password)',
                password: true,
                ignoreFocusOut: true
            })) || '';
        return !!this._accessToken;
    }

    private async storeAccessToken() {
        if (!this._accessToken) {
            return;
        }
        await keytar.setPassword(
            ConnectionManager.SERVICE_ID,
            this.createAccountId(this._xrayUrl, ConnectionManager.ACCESS_TOKEN_FS_KEY),
            this._accessToken
        );
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
     * Store Xray password and access token in Keychain.
     */
    private async storeConnection(): Promise<void> {
        await this.storeXrayUrl();
        await this.storeRtUrl();
        await this.storePlatformUrl();
        await this.storeUsername();
        await this.storePassword();
        await this.storeAccessToken();
    }

    private deleteCredentialsFromMemory() {
        this._accessToken = '';
        this._password = '';
        this._username = '';
        this._url = '';
        this._xrayUrl = '';
        this._rtUrl = '';
    }

    private async deleteCredentialFromFileSystem(): Promise<boolean> {
        // Delete password / access token must be executed first.
        let passOk: boolean = await this.deletePasswordFromFilesystem();
        let tokenOk: boolean = await this.deleteAccessTokenFromFilesystem();
        if (!passOk || !tokenOk) {
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
        return this.createJfrogClient()
            .artifactory()
            .search()
            .aqlSearch(aql);
    }

    public async downloadArtifact(artifactPath: string): Promise<string> {
        return this.createJfrogClient()
            .artifactory()
            .download()
            .downloadArtifact(artifactPath);
    }

    public async downloadBuildDetails(buildName: string, buildNumber: string): Promise<IDetailsResponse> {
        return this.createJfrogClient()
            .xray()
            .details()
            .build(buildName, buildNumber);
    }

    public createJfrogClient(): JfrogClient {
        return ConnectionUtils.createJfrogClient(this._url, this._rtUrl, this._xrayUrl, this._username, this._password, this._accessToken);
    }
}
