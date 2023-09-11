import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';
import { WebviewPage } from 'jfrog-ide-webview';
import { LogManager } from '../log/logManager';
import { WebviewEventManager } from './eventManager';
import { RunUtils } from '../utils/runUtils';

/**
 * Show a webview panel with details about objects in the project
 */
export class WebView {
    constructor(private _logManager: LogManager) {}

    private static readonly WEBVIEW_DELAY_MILLISECS: number = 3000;
    private _webview: vscode.WebviewPanel | undefined;
    private _eventManager: WebviewEventManager | undefined;
    private _currentPage: WebviewPage | undefined;

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
    public async updateWebview(data: WebviewPage, context: vscode.ExtensionContext) {
        // Create a custom API object
        if (!this._webview) {
            this._webview = this.createWebview(context);
            this._eventManager = new WebviewEventManager(this._webview.webview, context.subscriptions);
            // Workaround: Delay the initial page load to ensure proper message delivery in the Webview.
            // This is necessary because in the Webview, messages are only delivered when the webview is alive.
            // This workaround applies specifically to VS-Code remote development environments.
            await RunUtils.delay(WebView.WEBVIEW_DELAY_MILLISECS);
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

    private getHtmlForWebview(context: vscode.ExtensionContext, webview: vscode.Webview) {
        const data: string = fs.readFileSync(context.asAbsolutePath(path.join('dist', 'jfrog-ide-webview', 'index.html')), {
            encoding: 'utf8'
        });
        const webviewDataPath: vscode.Uri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'dist', 'jfrog-ide-webview')));
        return data.replace(/\.\/static/g, `${webviewDataPath}/static`);
    }
}
