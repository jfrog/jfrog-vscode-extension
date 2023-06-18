import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';
import { EventManager } from './event/eventManager';
import { LogManager } from '../log/logManager';
import { WebviewPage } from 'jfrog-ide-webview';

export abstract class WebView {
    protected eventManager?: EventManager;
    protected currentPage?: WebviewPage;

    constructor(protected _logManager: LogManager) {}

    public async activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('jfrog.view.details.page.open', (page: WebviewPage) => this.updateWebview(page, context)),
            vscode.commands.registerCommand('jfrog.view.details.page.close', () => this.closeWebview())
        );
    }

    /**
     * Close, if exists, an open webview page
     */
    public closeWebview() {
        this._currentPage = undefined;
        this._webview?.dispose();
    }

    /**
     * Create if not exists or update the webview panel with the given page data and show it in the editor
     * @param data - the data of the page to be update and show in the webpage
     * @param context - context of the extension
     */
    public updateWebview(data: WebviewPage, context: vscode.ExtensionContext) {
        // Create a custom API object
        if (!this._webview) {
            this._webview = this.createWebview(context);
            this._eventManager = new WebviewEventManager(this._webview.webview, context.subscriptions);
        } else {
            this._webview.reveal();
        }
        if (data && this._currentPage !== data) {
            this._currentPage = data;
            this._logManager.logMessage('Opening webview with data:\n' + JSON.stringify(data), 'DEBUG');
            this._eventManager?.loadPage(this._webview.webview, this._currentPage);
        }
    }

    private createWebview(context: vscode.ExtensionContext) {
        // Create and show panel
        let panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
            'jfrog.issues.details',
            'Vulnerability Details',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            {
                // Enable scripts in the webview
                enableScripts: true,
                enableFindWidget: true,
                enableCommandUris: true
            }
        );
        panel.iconPath = vscode.Uri.file(context.asAbsolutePath(path.join('resources', 'extensionIcon.png')));
        // And set its HTML content
        panel.webview.html = this.getHtmlForWebview(context, panel.webview);
        panel.onDidChangeViewState(async (webviewChanged: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
            if (this._currentPage) {
                await this._eventManager?.loadPage(webviewChanged.webviewPanel.webview, this._currentPage);
            }
        });
        panel.onDidDispose(
            () => {
                this._webview = undefined;
                this._eventManager = undefined;
            },
            undefined,
            context.subscriptions
        );
        return panel;
    }

    protected getHtml(context: vscode.ExtensionContext, webview: vscode.Webview) {
        const data: string = fs.readFileSync(context.asAbsolutePath(path.join('dist', 'jfrog-ide-webview', 'index.html')), {
            encoding: 'utf8'
        });
        const webviewDataPath: vscode.Uri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'dist', 'jfrog-ide-webview')));
        return data.replace(/\.\/static/g, `${webviewDataPath}/static`);
    }

    public loadPage(page: WebviewPage) {
        this.currentPage = page;
        if (this.eventManager !== undefined) {
            this.eventManager?.loadPage(this.currentPage);
        }
    }
}
