import { execSync } from 'child_process';
import * as crypto from 'crypto';
import {
    AccessTokenResponse,
    ClientUtils,
    IAqlSearchResult,
    IDetailsResponse,
    IGraphRequestModel,
    IGraphResponse,
    IUsageFeature,
    JfrogClient,
    XrayScanProgress
} from 'jfrog-client-js';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { ContextKeys, SessionStatus } from '../constants/contextKeys';
import { ExtensionComponent } from '../extensionComponent';
import { LogManager } from '../log/logManager';
import { ScanUtils } from '../utils/scanUtils';
import { ConnectionUtils } from './connectionUtils';

export enum LoginStatus {
    Success = 'SUCCESS',
    Failed = 'FAILED',
    FailedSaveCredentials = 'FAILED_SAVE_CREDENTIALS',
    FailedServerNotSupported = 'FAILED_SERVER_NOT_SUPPORTED',
    FailedTimeout = 'FAILED_TIMEOUT',
    FailedBadCredentials = 'FAILED_BAD_CREDENTIALS'
}

/**
 * Manage the JFrog Platform credentials and perform connection with JFrog Platform server.
 */
export class ConnectionManager implements ExtensionComponent, vscode.Disposable {
    // The username and URL keys in VS-Code global configuration
    private static readonly XRAY_USERNAME_KEY: string = 'jfrog.xray.username';
    private static readonly PLATFORM_URL_KEY: string = 'jfrog.xray.platformUrl';
    private static readonly XRAY_URL_KEY: string = 'jfrog.xray.url';
    private static readonly RT_URL_KEY: string = 'jfrog.rt.url';

    // Service ID in the OS KeyStore to store and retrieve the password / access token
    private static readonly SERVICE_ID: string = 'com.jfrog.xray.vscode';

    // Key used for uniqueness when storing access token in SecretStorage.
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

    private _statusBar!: vscode.StatusBarItem;
    private _context!: vscode.ExtensionContext;
    private _accessToken: string = '';
    private _username: string = '';
    private _password: string = '';
    private _xrayUrl: string = '';
    private _rtUrl: string = '';
    private _url: string = '';
    private _xrayVersion: string = '';
    private _artifactoryVersion: string = '';

    constructor(private _logManager: LogManager) {
        this._statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this._statusBar.tooltip = 'JFrog connection details';
        this._statusBar.command = 'jfrog.show.connectionStatus';
    }

    dispose() {
        this._statusBar.dispose();
    }

    public async activate(context: vscode.ExtensionContext): Promise<ConnectionManager> {
        this._context = context;
        switch (await this.getConnectionStatus()) {
            case SessionStatus.SignedIn:
            case SessionStatus.connectionLost:
                await this.handledSignedIn();
                break;
            case SessionStatus.SignedOut:
                this.setConnectionView(SessionStatus.SignedOut);
                break;
            default:
                await this.handelUnknownState();
                break;
        }

        this._statusBar.show();
        return this;
    }

    public async isSignedIn(): Promise<boolean> {
        return (await this.getConnectionStatus()) === SessionStatus.SignedIn;
    }

    public async isSignedOut(): Promise<boolean> {
        return (await this.getConnectionStatus()) === SessionStatus.SignedOut;
    }

    public async isConnectionLost(): Promise<boolean> {
        return (await this.getConnectionStatus()) === SessionStatus.connectionLost;
    }

    private async handledSignedIn() {
        if (!(await this.loadCredential())) {
            await this.disconnect();
            return;
        }
        if (!(await this.connect())) {
            this.setConnectionView(SessionStatus.connectionLost);
            await this.setConnectionStatus(SessionStatus.connectionLost);
        }
    }

    private async handelUnknownState() {
        if (!(await this.connect())) {
            this.setConnectionView(SessionStatus.SignedOut);
            await this.setConnectionStatus(SessionStatus.SignedOut);
        }
    }

    public async connect(): Promise<boolean> {
        this._logManager.logMessage('Trying to read credentials from Secret Storage...', 'DEBUG');
        if (!(await this.pingCredential())) {
            this.deleteCredentialsFromMemory();
            return false;
        }
        await this.resolveUrls();
        await this.onSuccessConnect();
        return true;
    }

    private async pingCredential(): Promise<boolean> {
        if (await this.loadCredential()) {
            try {
                return await ConnectionUtils.validateXrayConnection(this.xrayUrl, this._username, this._password, this._accessToken);
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    public async loadCredential(): Promise<boolean> {
        return (
            (await this.setUrlsFromFilesystem()) &&
            (((await this.setUsernameFromFilesystem()) && (await this.getPasswordFromSecretStorage())) ||
                (await this.getAccessTokenFromSecretStorage()))
        );
    }

    public async onSuccessConnect() {
        await this.setConnectionStatus(SessionStatus.SignedIn);
        this.setConnectionView(SessionStatus.SignedIn);
        this.updateJfrogVersions();
        vscode.commands.executeCommand('jfrog.view.local');
    }

    public async disconnect(): Promise<boolean> {
        return await vscode.window.withProgress(
            <vscode.ProgressOptions>{ location: vscode.ProgressLocation.Window, title: 'Delete Xray connection details...' },
            async (): Promise<boolean> => {
                await this.deleteCredentialsFromFileSystem();
                this.deleteCredentialsFromMemory();
                await this.setConnectionStatus(SessionStatus.SignedOut);
                this.setConnectionView(SessionStatus.SignedOut);
                vscode.commands.executeCommand('jfrog.view.login');
                return true;
            }
        );
    }

    public areXrayCredentialsSet(): boolean {
        return !!((this._url || this._xrayUrl) && ((this._username && this._password) || this._accessToken));
    }

    public areCompleteCredentialsSet(): boolean {
        return !!(this._xrayUrl && this._rtUrl && ((this._username && this._password) || this._accessToken));
    }

    public async verifyCredentials(prompt: boolean): Promise<boolean> {
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

    public async readCredentialsFromJfrogCli(): Promise<boolean> {
        if (!(await this.verifyJfrogCliInstalledAndVersion())) {
            return false;
        }
        return await this.getJfrogCliDefaultServerConfiguration();
    }

    public async tryGetUrlFromJFrogCli(): Promise<string> {
        try {
            if (await this.verifyJfrogCliInstalledAndVersion()) {
                return this.getJfrogCliDefaultServerUrl();
            }
        } catch (error) {
            this._logManager.logMessage('Error encountered while reading platform URL from JFrog CLI: ' + error, 'DEBUG');
        }
        return '';
    }

    public tryGetUrlFromEnv(): string {
        return this.getPlatformUrlFromEnv();
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
            const versionPrefix: string = 'jf version ';
            let output: string = execSync('jf -v').toString();
            if (!output.startsWith(versionPrefix)) {
                this._logManager.logMessage('Unexpected output to JFrog CLI version command: ' + output, 'DEBUG');
                return '';
            }
            return output.replace(versionPrefix, '').trim();
        } catch (error) {
            this._logManager.logMessage('Could not find a JFrog CLI installation: ' + error, 'DEBUG');
            return '';
        }
    }

    private async getJfrogCliDefaultServerConfiguration(): Promise<boolean> {
        try {
            let output: string = execSync('jf c export').toString();
            let confStr: string = Buffer.from(output, 'base64').toString('ascii');
            let conf: any = JSON.parse(confStr);

            this._url = this.getJfrogCliDefaultServerUrl();
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
                this._logManager.logMessage('Successfully obtained credentials from JFrog CLI', 'DEBUG');
                return true;
            }
            return false;
        } catch (error) {
            this._logManager.logMessage('Error encountered while reading credentials from JFrog CLI: ' + error, 'DEBUG');
            return false;
        }
    }

    private getJfrogCliDefaultServerUrl(): string {
        let output: string = execSync('jf c export').toString();
        let confStr: string = Buffer.from(output, 'base64').toString('ascii');
        let conf: any = JSON.parse(confStr);

        return conf['url'] || '';
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

    public get xrayVersion() {
        return this._xrayVersion;
    }

    public get artifactoryVersion() {
        return this._artifactoryVersion;
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
                this._url = this._url.substring(0, this._url.lastIndexOf('/xray'));
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

    public async tryCredentialsFromEnv(): Promise<LoginStatus> {
        if (!(await this.getCredentialsFromEnv())) {
            this.deleteCredentialsFromMemory();
            return LoginStatus.Failed;
        }
        if (!(await this.verifyCredentials(false))) {
            this.deleteCredentialsFromMemory();
            return LoginStatus.FailedBadCredentials;
        }
        if (process.env[ConnectionManager.STORE_CONNECTION_ENV]?.toUpperCase() === 'TRUE') {
            // Store credentials in file system if JFROG_IDE_STORE_CONNECTION environment variable is true
            return (await this.storeConnection()) ? LoginStatus.Success : LoginStatus.FailedSaveCredentials;
        }
        return LoginStatus.Success;
    }

    public async tryCredentialsFromJfrogCli(): Promise<LoginStatus> {
        this._logManager.logMessage('Trying to read credentials from JFrog CLI...', 'DEBUG');
        if (!(await this.readCredentialsFromJfrogCli())) {
            this.deleteCredentialsFromMemory();
            return LoginStatus.Failed;
        }
        if (!(await this.verifyCredentials(true))) {
            this.deleteCredentialsFromMemory();
            return LoginStatus.FailedBadCredentials;
        }
        return (await this.storeConnection()) ? LoginStatus.Success : LoginStatus.FailedSaveCredentials;
    }
    /**
     * Initiates a web-based login process and obtains an access token.
     * @param url - The platform URL.
     * @param artifactoryUrl - The Artifactory URL.
     * @param xrayUrl - The Xray URL.
     * @returns A promise that resolves to the login status.
     */
    public async startWebLogin(url: string, artifactoryUrl: string, xrayUrl: string): Promise<LoginStatus> {
        if (url === '' || artifactoryUrl === '' || xrayUrl === '') {
            return LoginStatus.Failed;
        }
        this._logManager.logMessage('Start Web-Login with "' + url + '"', 'DEBUG');
        const sessionId: string = crypto.randomUUID();
        if (!(await this.registerWebLoginId(url, sessionId))) {
            return LoginStatus.FailedServerNotSupported;
        }
        if (!(await this.openBrowser(this.createWebLoginEndpoint(url, sessionId)))) {
            return LoginStatus.Failed;
        }
        const accessToken: string = await this.getWebLoginAccessToken(url, sessionId);
        if (accessToken === '') {
            return LoginStatus.FailedTimeout;
        }
        return this.tryStoreCredentials(url, artifactoryUrl, xrayUrl, '', '', accessToken);
    }

    private async registerWebLoginId(url: string, sessionId: string) {
        try {
            this._logManager.logMessage('Register session token ' + sessionId, 'DEBUG');
            await ConnectionUtils.createJfrogClient(url, '', '', '', '', '')
                .platform()
                .webLogin()
                .registerSessionId(sessionId);
        } catch (error) {
            this._logManager.logMessage(JSON.stringify(error), 'ERR');
            return false;
        }
        return true;
    }

    /**
     * Opens the browser window with the login URL for the given session ID and client name.
     * @param id - The session ID.
     */
    private async openBrowser(target: vscode.Uri): Promise<boolean> {
        try {
            await vscode.env.openExternal(target);
        } catch (error) {
            this._logManager.logMessage('Failed to open the browser to' + target + ' Error:' + error, 'ERR');
            return false;
        }
        return true;
    }

    private async getWebLoginAccessToken(url: string, sessionId: string): Promise<string> {
        try {
            const accessTokenData: AccessTokenResponse = await ConnectionUtils.createJfrogClient(
                url,
                '',
                '',
                '',
                '',
                '',
                20,
                undefined,
                this._logManager,
                (statusCode: number) => statusCode >= 500 || statusCode === 400,
                15000
            )
                .platform()
                .webLogin()
                .getToken(sessionId);
            return accessTokenData.access_token;
        } catch (error) {
            this._logManager.logMessage('Failed to get access token for SSO login at "' + url + '". Error:' + error, 'ERR');
            return '';
        }
    }

    public createWebLoginEndpoint(platformUrl: string, sessionId: string): vscode.Uri {
        const endpoint: string = ClientUtils.addTrailingSlashIfMissing(platformUrl) + `ui/login?jfClientSession=${sessionId}&jfClientName=VS-Code`;
        this._logManager.logMessage('Open browser at ' + endpoint, 'INFO');
        return vscode.Uri.parse(endpoint);
    }

    public async tryStoreCredentials(
        url: string,
        rtUrl: string,
        xrayUrl: string,
        username?: string,
        password?: string,
        accessToken?: string
    ): Promise<LoginStatus> {
        this._url = url;
        this._xrayUrl = xrayUrl;
        this._rtUrl = rtUrl;
        this._username = username || '';
        this._password = password || '';
        this._accessToken = accessToken || '';
        const valid: boolean = await this.verifyCredentials(false);
        if (!valid) {
            this.deleteCredentialsFromMemory();
            return LoginStatus.FailedBadCredentials;
        }
        return (await this.storeConnection()) ? LoginStatus.Success : LoginStatus.FailedSaveCredentials;
    }

    public async getCredentialsFromEnv(): Promise<boolean> {
        this._logManager.logMessage('Trying to read credentials from env...', 'DEBUG');
        this._url = this.getPlatformUrlFromEnv();
        this._username = process.env[ConnectionManager.USERNAME_ENV] || '';
        this._password = process.env[ConnectionManager.PASSWORD_ENV] || '';
        this._accessToken = process.env[ConnectionManager.ACCESS_TOKEN_ENV] || '';

        let credentialsSet: boolean = this.areXrayCredentialsSet();
        if (!credentialsSet) {
            return false;
        }
        await this.resolveUrls();
        return true;
    }

    public getPlatformUrlFromEnv(): string {
        return process.env[ConnectionManager.URL_ENV] || '';
    }

    private async setUrlsFromFilesystem(): Promise<boolean> {
        this._url = (await this._context.globalState.get(ConnectionManager.PLATFORM_URL_KEY)) || '';
        this._xrayUrl = (await this._context.globalState.get(ConnectionManager.XRAY_URL_KEY)) || '';
        this._rtUrl = (await this._context.globalState.get(ConnectionManager.RT_URL_KEY)) || '';
        return !!this._url || !!this._xrayUrl;
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

    private async storeUsername() {
        await this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, this._username);
    }

    private async getPasswordFromSecretStorage(): Promise<boolean> {
        this._password = await this.getSecretFromSecretStorage(this._username);
        return !!this._password;
    }

    private async getAccessTokenFromSecretStorage(): Promise<boolean> {
        this._accessToken = await this.getSecretFromSecretStorage(ConnectionManager.ACCESS_TOKEN_FS_KEY);
        return !!this._accessToken;
    }

    /**
     * Password and access token are saved in SecretStorage with an account that is a hash of url and another string.
     * For password - username, access token - a constant.
     * @param keyPair - The second string of the account as described above.
     * @returns The secret if found.
     */
    private async getSecretFromSecretStorage(keyPair: string): Promise<string> {
        return (
            (await this._context.secrets.get(this.createSecretStoreId(this._url, keyPair))) ||
            (await this._context.secrets.get(this.createSecretStoreId(this._xrayUrl, keyPair))) ||
            ''
        );
    }

    private async deletePasswordFromSecretStorage(): Promise<void> {
        if (!this._password) {
            return;
        }
        await this.deleteSecretFromSecretStorage(this._username);
    }

    private async deleteAccessTokenFromSecretStorage(): Promise<void> {
        if (!this._accessToken) {
            return;
        }
        await this.deleteSecretFromSecretStorage(ConnectionManager.ACCESS_TOKEN_FS_KEY);
    }

    private async deleteSecretFromSecretStorage(keyPair: string): Promise<void> {
        await this._context.secrets.delete(this.createSecretStoreId(this._xrayUrl, keyPair));
    }

    private async storePassword(): Promise<void> {
        if (!this._password) {
            return;
        }
        await this._context.secrets.store(this.createSecretStoreId(this._xrayUrl, this._username), this._password);
    }

    private async storeAccessToken(): Promise<void> {
        if (!this._accessToken) {
            return;
        }
        await this._context.secrets.store(this.createSecretStoreId(this._xrayUrl, ConnectionManager.ACCESS_TOKEN_FS_KEY), this._accessToken);
    }

    /**
     * Create obscured account id to get extra security.
     * @param url     - Xray url
     * @param keyPair - Unique key
     * @returns hashed account id
     */
    private createAccountId(url: string, keyPair: string): string {
        return ScanUtils.Hash('sha256', url + keyPair);
    }

    /**
     * Return unique Secret Store ID to allow retrieving/storing/deleting a value from the Secret Store.
     * @param url     - Xray url
     * @param keyPair - Unique key
     * @returns Secret Store ID
     */
    private createSecretStoreId(url: string, keyPair: string): string {
        return ConnectionManager.SERVICE_ID + '.' + this.createAccountId(url, keyPair);
    }

    /**
     * By setting the global context, we can save a key/value pair.
     * VS Code manages the storage and will restore it for each extension activation.
     */
    private async setConnectionStatus(status: SessionStatus) {
        await this._context.globalState.update(ContextKeys.SESSION_STATUS, status);
    }

    /**
     * @returns The user connection status whether it is connected to JFrog platform or not. First time use will return undefined.
     */
    private async getConnectionStatus(): Promise<SessionStatus | undefined> {
        const status: SessionStatus | undefined = (await this._context.globalState.get(ContextKeys.SESSION_STATUS)) || undefined;
        return status;
    }

    /**
     * By setting the context with ExecuteCommand, we can change the visibility of extension elements in VS-Code's UI, such as icons or windows.
     * This state will be reset when VS-Code is restarted.
     */
    private setConnectionView(status: SessionStatus) {
        vscode.commands.executeCommand(ContextKeys.SET_CONTEXT, ContextKeys.SESSION_STATUS, status);
        switch (status) {
            case SessionStatus.SignedIn:
                this._statusBar.text = '🟢 JFrog';
                break;
            case SessionStatus.connectionLost:
                this._statusBar.text = '🟠 JFrog';
                break;
            case SessionStatus.SignedOut:
                this._statusBar.text = '🔴 JFrog';
                break;
        }
    }

    /**
     * Store URLs and username in VS-Code global state.
     * Store Xray password and access token in Key chain.
     */
    private async storeConnection(): Promise<boolean> {
        try {
            await this.storeXrayUrl();
            await this.storeRtUrl();
            await this.storePlatformUrl();
            await this.storeUsername();
            await this.storePassword();
            await this.storeAccessToken();
            return true;
        } catch (error) {
            this._logManager.logMessage('Failed to store credentials. ' + JSON.stringify(error), 'ERR');
        }
        return false;
    }

    public deleteCredentialsFromMemory() {
        this._accessToken = '';
        this._password = '';
        this._username = '';
        this._url = '';
        this._xrayUrl = '';
        this._rtUrl = '';
        this._xrayVersion = '';
    }

    private async deleteCredentialsFromFileSystem(): Promise<void> {
        // Delete password / access token must be executed first.
        await Promise.all([await this.deletePasswordFromSecretStorage(), await this.deleteAccessTokenFromSecretStorage()]);
        await Promise.all([
            this._context.globalState.update(ConnectionManager.XRAY_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.RT_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.PLATFORM_URL_KEY, undefined),
            this._context.globalState.update(ConnectionManager.XRAY_USERNAME_KEY, undefined)
        ]);
    }

    /**
     * Do Xray's scan/graph REST API.
     * @param graphRequest     - The component's graph to scan
     * @param checkCanceled    - A function that throws ScanCancellationError if the user chose to stop the scan
     * @param project          - JFrog project key
     * @returns graph of all requested components with vulnerabilities and licenses information.
     */
    public async scanWithGraph(
        graphRequest: IGraphRequestModel,
        progress: XrayScanProgress,
        checkCanceled: () => void,
        project: string,
        watches: string[]
    ): Promise<IGraphResponse> {
        let policyMessage: string = '';
        if (watches.length > 0) {
            policyMessage += ` Using Watches: [${watches.join(', ')}]`;
        } else if (project && project !== '') {
            policyMessage += ` Using Project key: ${project}`;
        }
        this._logManager.logMessage('Sending dependency graph "' + graphRequest.component_id + '" to Xray for analyzing.' + policyMessage, 'DEBUG');
        return await this.createJfrogClient()
            .xray()
            .scan()
            .graph(graphRequest, progress, checkCanceled, project, watches);
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

    public async downloadBuildDetails(buildName: string, buildNumber: string, projectKey: string): Promise<IDetailsResponse> {
        return this.createJfrogClient()
            .xray()
            .details()
            .build(buildName, buildNumber, projectKey);
    }

    public createJfrogClient(): JfrogClient {
        return ConnectionUtils.createJfrogClient(this._url, this._rtUrl, this._xrayUrl, this._username, this._password, this._accessToken);
    }

    private async updateJfrogVersions() {
        await Promise.all([this.updateArtifactoryVersion(), this.updateXrayVersion()]);
    }

    private async updateXrayVersion() {
        this._xrayVersion = await ConnectionUtils.getXrayVersion(this.createJfrogClient());
    }

    private async updateArtifactoryVersion() {
        this._artifactoryVersion = await ConnectionUtils.getArtifactoryVersion(this.createJfrogClient());
    }

    public async sendUsageReport(featureArray: IUsageFeature[]): Promise<void> {
        const usagePrefix: string = 'Usage Report: ';
        if (!this.areCompleteCredentialsSet()) {
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
