import { ILoginPage, ISendLoginEventData, LoginConnectionType, LoginProgressStatus, PageType } from 'jfrog-ide-webview';
import { EventSender } from '../eventSender';
import * as vscode from 'vscode';
import { LogManager } from '../../../log/logManager';
import { ConnectionManager, LoginStatus } from '../../../connect/connectionManager';
import { ClientUtils } from 'jfrog-client-js';
import crypto from 'crypto'; // Important - Don't import '*'. It'll import deprecated encryption methods

/**
 * Represents a login task that handles the authentication process and communicates with the webview.
 */
export class LoginTask {
    private updatedPageStatus: ILoginPage;
    private platformUrl: string;
    private artifactoryUrl: string;
    private xrayUrl: string;
    private username?: string;
    private password?: string;
    private accessToken?: string;

    constructor(private send: EventSender, data: ISendLoginEventData, private connectionManager: ConnectionManager, private logManager: LogManager) {
        this.updatedPageStatus = {
            pageType: PageType.Login,
            url: data.url || '',
            status: LoginProgressStatus.Verifying,
            connectionType: data.loginConnectionType
        };
        this.platformUrl = data.url !== undefined ? ClientUtils.addTrailingSlashIfMissing(data.url) : '';
        this.artifactoryUrl = data.artifactoryUrl || this.platformUrl + 'artifactory';
        this.xrayUrl = data.xrayUrl || this.platformUrl + 'xray';
        this.username = data.username;
        this.password = data.password;
        this.accessToken = data.accessToken;
    }

    /**
     * Executes the login task.
     */
    public async run() {
        // Perform login and update page status
        const requestStatus: LoginProgressStatus = await this.doLogin();
        await this.send.loadPage({ ...this.updatedPageStatus, status: requestStatus });

        // Connect to the IDE if login is successful
        if (requestStatus === LoginProgressStatus.Success) {
            this.connectIde();
        }
    }

    /**
     * Connects to the IDE after a successful login.
     * Waits for 3 seconds to let the user see the 'success' animation and read the instructions.
     */
    private async connectIde() {
        await new Promise(resolve =>
            setTimeout(() => {
                resolve(vscode.commands.executeCommand('jfrog.xray.connect'));
            }, 3000)
        );
    }

    /**
     * Performs the login operation based on the connection type.
     */
    private async doLogin(): Promise<LoginProgressStatus> {
        try {
            let status: LoginStatus;
            switch (this.updatedPageStatus.connectionType) {
                case LoginConnectionType.Sso:
                    status = await this.startWebLogin();
                    break;
                case LoginConnectionType.BasicAuthOrToken:
                    await this.send.loadPage(this.updatedPageStatus);
                    status = await this.connectionManager.tryStoreCredentials(
                        this.platformUrl,
                        this.artifactoryUrl,
                        this.xrayUrl,
                        this.username,
                        this.password,
                        this.accessToken
                    );
                    break;
                case LoginConnectionType.Cli:
                    await this.send.loadPage(this.updatedPageStatus);
                    status = await this.connectionManager.tryCredentialsFromJfrogCli();
                    break;
                case LoginConnectionType.EnvVars:
                    await this.send.loadPage(this.updatedPageStatus);
                    status = await this.connectionManager.tryCredentialsFromEnv();
            }
            return this.toWebviewLoginStatus(status);
        } catch (error) {
            this.logManager.logMessage(`Failed to sign in. Error: ${JSON.stringify(error)}`, 'ERR');
            return LoginProgressStatus.Failed;
        }
    }

    private async startWebLogin(): Promise<LoginStatus> {
        const sessionId: string = crypto.randomUUID();

        this.updatedPageStatus.ssoVerification = {
            code: sessionId.substring(sessionId.length - 4),
            codeTimeoutMs: 300000
        };
        // Update webview page
        await this.send.loadPage(this.updatedPageStatus);

        return await this.connectionManager.startWebLogin(sessionId, this.platformUrl, this.artifactoryUrl, this.xrayUrl);
    }

    public toWebviewLoginStatus(ideStatus: LoginStatus) {
        switch (ideStatus) {
            case LoginStatus.Success:
                return LoginProgressStatus.Success;
            case LoginStatus.FailedBadCredentials:
                return LoginProgressStatus.FailedBadCredentials;
            case LoginStatus.FailedTimeout:
                return LoginProgressStatus.FailedTimeout;
            case LoginStatus.FailedServerNotSupported:
                return LoginProgressStatus.FailedServerNotFound;
            case LoginStatus.FailedSaveCredentials:
                return LoginProgressStatus.FailedSaveCredentials;
            default:
                return LoginProgressStatus.Failed;
        }
    }
}
