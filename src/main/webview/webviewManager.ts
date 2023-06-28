import * as vscode from 'vscode';
import { ILoginPage, LoginConnectionType, LoginProgressStatus, PageType, WebviewPage } from 'jfrog-ide-webview';
import { ConnectionManager } from '../connect/connectionManager';
import { WebviewTab } from './webviewTab';
import { WebviewSidebar } from './webviewSidebar';
import { LogManager } from '../log/logManager';

/**
 * Manages the webview functionality for the extension.
 */
export class WebviewManager {
    private webviewTab: WebviewTab;
    private webviewSidebar: WebviewSidebar;
    constructor(logManager: LogManager, private connectionManager: ConnectionManager, private context: vscode.ExtensionContext) {
        this.webviewTab = new WebviewTab(logManager, connectionManager, context);
        this.webviewSidebar = new WebviewSidebar(logManager, connectionManager, context);
    }

    public async activate() {
        await this.initializeWebviewSidebar();
        this.context.subscriptions.push(vscode.commands.registerCommand('jfrog.webview.tab', (page: WebviewPage) => this.loadWebviewTab(page)));
    }

    private async initializeWebviewSidebar() {
        this.webviewSidebar.loadPage(await this.createLoginPage());
    }

    private loadWebviewTab(page: WebviewPage) {
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
        let url: string = await this.connectionManager.tryGetUrlFromJfrogCli();
        if (url !== '') {
            return { ...page, status: LoginProgressStatus.AutoConnect, url: url, connectionType: LoginConnectionType.Cli };
        }

        url = this.connectionManager.tryGetUrlFromEnv();
        if (url !== '') {
            return { ...page, status: LoginProgressStatus.AutoConnect, url: url, connectionType: LoginConnectionType.EnvVars };
        }
        return page;
    }
}
