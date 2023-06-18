import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { EventManager } from './event/eventManager';
import { WebView } from './webview';
import { LogManager } from '../log/logManager';

export class WebviewSidebar extends WebView implements vscode.WebviewViewProvider {
    public static readonly viewType: string = 'jfrog.webview.sidebar';

    private webview?: vscode.WebviewView;
    constructor(logManager: LogManager, private connectionManager: ConnectionManager, private context: vscode.ExtensionContext) {
        super(logManager);
        this.context.subscriptions.push(vscode.window.registerWebviewViewProvider(WebviewSidebar.viewType, this));
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView) {
        if (this.webview === undefined) {
            this.webview = await this.createWebview(webviewView);
            this.eventManager = this.createEventManager(this.webview);
        }
        if (this.currentPage != undefined) {
            this.eventManager?.loadPage(this.currentPage);
        }
    }

    private async createWebview(currentWebview: vscode.WebviewView) {
        currentWebview.webview.html = this.getHtml(this.context, currentWebview.webview);
        currentWebview.onDidDispose(
            () => {
                this.eventManager = undefined;
                this.webview = undefined;
            },
            undefined,
            this.context.subscriptions
        );
        currentWebview.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [this.context.extensionUri]
        };
        return currentWebview;
    }

    private createEventManager(webview: vscode.WebviewView) {
        const eventManager: EventManager = new EventManager(webview.webview, this.connectionManager, this._logManager);
        webview.onDidChangeVisibility(() => {
            this.eventManager = new EventManager(webview.webview, this.connectionManager, this._logManager);
            if (this.currentPage) {
                eventManager.loadPage(this.currentPage);
            }
        });
        return eventManager;
    }
}
