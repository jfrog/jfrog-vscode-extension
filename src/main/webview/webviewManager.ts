import * as vscode from 'vscode';
import { ILoginPage, LoginConnectionType, LoginProgressStatus, PageType, WebviewPage } from 'jfrog-ide-webview';
import { ConnectionManager } from '../connect/connectionManager';
import { WebviewTab } from './webviewTab';
import { WebviewSidebar } from './webviewSidebar';
import { LogManager } from '../log/logManager';
import { ExtensionComponent } from '../extensionComponent';

/**
 * Manages the webview functionality for the extension.
 */
export class WebviewManager implements ExtensionComponent  {
    private webviewTab: WebviewTab;
    private webviewSidebar: WebviewSidebar;
    constructor(logManager: LogManager, private connectionManager: ConnectionManager, context: vscode.ExtensionContext) {
        this.webviewTab = new WebviewTab(logManager, connectionManager, context);
        this.webviewSidebar = new WebviewSidebar(logManager, connectionManager, context);
    }

    public activate() {
        return this;
    }

    public async initializeWebviewSidebar() {
        this.webviewSidebar.loadPage(await this.createLoginPage());
    }

    public loadWebviewTab(page: WebviewPage) {
        this.webviewTab.resolveWebviewView();
        this.webviewTab.loadPage(page);
    }

    private async createLoginPage(): Promise<ILoginPage> {
        let page: ILoginPage = {
            pageType: PageType.Login,
            status: LoginProgressStatus.Initial,
            url: '',
            connectionType: LoginConnectionType.BasicAuthOrToken
        };

        let url: string = this.connectionManager.tryGetUrlFromEnv();
        if (url !== '') {
            return { ...page, status: LoginProgressStatus.AutoConnect, url: url, connectionType: LoginConnectionType.EnvVars };
        }

        url = await this.connectionManager.tryGetUrlFromJFrogCli();
        if (url !== '') {
            return { ...page, status: LoginProgressStatus.AutoConnect, url: url, connectionType: LoginConnectionType.Cli };
        }

        return page;
    }
}
