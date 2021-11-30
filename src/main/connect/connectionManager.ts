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
    IUsageFeature,
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

    // Service ID in the OS KeyStore to store and retrieve the password / access token
    private static readonly SERVICE_ID: string = 'com.jfrog.xray.vscode';
    // Key used for uniqueness when storing access token in KeyStore.
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
        if (await this.populateCredentials(true)) {
            this.updateConnectionIcon();
            return true;
        }
        return false;
    }

    public async disconnect(): Promise<boolean> {
        return await vscode.window.withProgress(
            <vscode.ProgressOptions>{ location: vscode.ProgressLocation.Window, title: 'Delete Xray connection details...' },
            async (): Promise<boolean> => {
                await this.deleteCredentialsFromFileSystem();
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
        return !!(this._xrayUrl && this._rtUrl && ((this._username && this._password) || this._accessToken));
    }

    /**
     * Credentials priorities:
     * 1. Credentials from KeyStore and global storage.
     * 2. Credentials from Environment variable.
     * 3. Credentials from JFrog CLI.
     * 4. Credentials from Promp (if interactive).
     * @param prompt - True if should prompt
     * @returns true if the credentials populates
     */
    public async populateCredentials(prompt: boolean): Promise<boolean> {
        return (
            (await this.tryCredentialsFromKeyStore()) ||
            (await this.tryCredentialsFromEnv()) ||
            (await this.tryCredentialsFromJfrogCli()) ||
            (prompt && (await this.tryCredentialsFromPrmopt()))
        );
    }

    private async verifyNewCredentials(prompt: boolean): Promise<boolean> {
        if (!this.areXrayCredentialsSet()) {
            return false;
        }
        if (
            !(await ConnectionUtils.checkXrayConnectionAndPermissions(
                this._xrayUrl,
                this._username,
                this._password,
                this._accessToken,
                prompt,
                this._logManager
            ))
        ) {
            return false;
        }
        if (this.areCompleteCredentialsSet()) {
            return ConnectionUtils.checkArtifactoryConnection(
                this._rtUrl,
                this._username,
                this._password,
                this._accessToken,
                prompt,
                this._logManager
            );
        }
        return true;
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
            this._logManager.logMessage('Unexpected error when trying to read credentials from JFrog CLI: ' + error, 'DEBUG');
            return false;
        }
        return true;
    }

    private async getJfrogCliVersion(): Promise<string> {
        try {
            const versionPrefix: string = 'jfrog version ';
            let output: string = execSync('jf -v').toString();
            if (!output.startsWith(versionPrefix)) {
                this._logManager.logMessage('Unexpected output to JFrog CLI version command: ' + output, 'DEBUG');
                return '';
            }
            return output.replace(versionPrefix, '').trim();
        } catch (error) {
            this._logManager.logMessage('Could not find a JFrog CLI installation. Error: ' + error, 'DEBUG');
            return '';
        }
    }

    private async getJfrogCliDefaultServerConfiguration(): Promise<boolean> {
        try {
            let output: string = execSync('jf c export').toString();
            let confStr: string = Buffer.from(output, 'base64').toString('ascii');
            let conf: any = JSON.parse(confStr);

            this._url = conf['url'] || '';
            this._xrayUrl = conf['xrayUrl'] || '';
            this._rtUrl = conf['artifactoryUrl'] || '';

            // Get basic auth if exists. Access token other wise.
            const username: string = conf['user'] || '';
            const password: string = conf['password'] || '';
            if (username !== '' && password !== '') {
                this._username = username;
                this._password = password;
            } else {
                this._accessToken = conf['accessToken'] || '';
            }

            if (this.areCompleteCredentialsSet()) {
                this._logManager.logMessage('Successfuly obtained credentials from JFrog CLI', 'DEBUG');
                return true;
            }
            return false;
        } catch (error) {
            this._logManager.logMessage('Error encountered while reading credentials from JFrog CLI: ' + error, 'DEBUG');
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

    private async tryCredentialsFromEnv(): Promise<boolean> {
        this._logManager.logMessage('Trying to read credentials from env...', 'DEBUG');
        this._url = process.env[ConnectionManager.URL_ENV] || '';
        this._username = process.env[ConnectionManager.USERNAME_ENV] || '';
        this._password = process.env[ConnectionManager.PASSWORD_ENV] || '';
        this._accessToken = process.env[ConnectionManager.ACCESS_TOKEN_ENV] || '';

        let credentialsSet: boolean = this.areXrayCredentialsSet();
        if (!credentialsSet) {
            this.deleteCredentialsFromMemory();
            return false;
        }
        await this.resolveUrls();
        if (!(await this.verifyNewCredentials(false))) {
            this.deleteCredentialsFromMemory();
            return false;
        }
        if (process.env[ConnectionManager.STORE_CONNECTION_ENV]?.toUpperCase() === 'TRUE') {
            // Store credentials in file system if JFROG_IDE_STORE_CONNECTION environment variable is true
            await this.storeConnection();
        }
        return true;
    }

    private async tryCredentialsFromKeyStore(): Promise<boolean> {
        this._logManager.logMessage('Trying to read credentials from KeyStore...', 'DEBUG');
        const credentialsSet: boolean =
            (await this.setUrlsFromFilesystem()) &&
            (((await this.setUsernameFromFilesystem()) && (await this.setPasswordFromKeyStore())) || (await this.setAccessTokenFromKeyStore()));
        if (!credentialsSet) {
            this.deleteCredentialsFromMemory();
            return false;
        }
        await this.resolveUrls();
        return true;
    }

    private async tryCredentialsFromJfrogCli(): Promise<boolean> {
        this._logManager.logMessage('Trying to read credentials from JFrog CLI...', 'DEBUG');
        if (!(await this.readCredentialsFromJfrogCli())) {
            this.deleteCredentialsFromMemory();
            return false;
        }
        if (!(await this.verifyNewCredentials(false))) {
            this.deleteCredentialsFromMemory();
            return false;
        }
        await this.storeConnection();
        return true;
    }

    private async tryCredentialsFromPrmopt(): Promise<boolean> {
        this._logManager.logMessage('Prompting for credentials...', 'DEBUG');
        if (!(await this.promptAll())) {
            return false;
        }
        const valid: boolean = await vscode.window.withProgress(
            <vscode.ProgressOptions>{ location: vscode.ProgressLocation.Window, title: 'Checking connection with Xray server...' },
            async (): Promise<boolean> => {
                return await this.verifyNewCredentials(true);
            }
        );
        if (!valid) {
            this.deleteCredentialsFromMemory();
            return false;
        }
        await this.storeConnection();
        return true;
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

    private async setPasswordFromKeyStore(): Promise<boolean> {
        this._password = await this.getSecretFromKeyStore(this._username);
        return !!this._password;
    }

    private async setAccessTokenFromKeyStore(): Promise<boolean> {
        this._accessToken = await this.getSecretFromKeyStore(ConnectionManager.ACCESS_TOKEN_FS_KEY);
        return !!this._accessToken;
    }

    /**
     * Password and access token are saved in KeyStore with an account that is a hash of url and another string.
     * For password - username, access token - a constant.
     * @param keyPair - The second string of the account as described above.
     * @returns The secret if found.
     */
    private async getSecretFromKeyStore(keyPair: string): Promise<string> {
        return (
            (await keytar.getPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._url, keyPair))) ||
            (await keytar.getPassword(ConnectionManager.SERVICE_ID, this.createAccountId(this._xrayUrl, keyPair))) ||
            ''
        );
    }

    private async deletePasswordFromKeyStore(): Promise<boolean> {
        if (!this._password) {
            return true;
        }
        return await this.deleteSecretFromKeyStore(this._username, 'password');
    }

    private async deleteAccessTokenFromKeyStore(): Promise<boolean> {
        if (!this._accessToken) {
            return true;
        }
        return await this.deleteSecretFromKeyStore(ConnectionManager.ACCESS_TOKEN_FS_KEY, 'access token');
    }

    private async deleteSecretFromKeyStore(keyPair: string, secretName: string): Promise<boolean> {
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

    private async deleteCredentialsFromFileSystem(): Promise<boolean> {
        // Delete password / access token must be executed first.
        let passOk: boolean = await this.deletePasswordFromKeyStore();
        let tokenOk: boolean = await this.deleteAccessTokenFromKeyStore();
        await Promise.all([
            this._context.globalState.update(ConnectionManager.XRAY_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.RT_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.PLATFORM_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, undefined)
        ]);
        return passOk && tokenOk;
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

    public async sendUsageReport(featureArray: IUsageFeature[]): Promise<void> {
        const usagePrefix: string = 'Usage Report: ';
        if (!this.areAllCredentialsSet()) {
            this._logManager.logMessage(usagePrefix + 'Artifactory is not configured. Skipping usage report sending...', 'DEBUG');
        }
        try {
            await this.createJfrogClient()
                .artifactory()
                .system()
                .reportUsage(ConnectionUtils.USER_AGENT, featureArray);
        } catch (error) {
            this._logManager.logMessage(usagePrefix + 'Failed sending usage report: ' + error, 'DEBUG');
            return;
        }
        this._logManager.logMessage(usagePrefix + 'Usage report sent successfully.', 'DEBUG');
    }
}
