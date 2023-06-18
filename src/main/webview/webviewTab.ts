import * as vscode from 'vscode';
import * as path from 'path';
import { LogManager } from '../log/logManager';
import { EventManager } from './event/eventManager';
import { WebView } from './webview';
import { ConnectionManager } from '../connect/connectionManager';

/**
 * Show a webview panel with details about objects in the project
 */
export class WebviewTab extends WebView {
    constructor(logManager: LogManager, private connectionManager: ConnectionManager, private context: vscode.ExtensionContext) {
        super(logManager);
    }
    private webview: vscode.WebviewPanel | undefined;

    /**
     * Create if not exists or update the webview panel with the given page data and show it in the editor
     * @param data - the data of the page to be update and show in the webpage
     * @param context - context of the extension
     */
    public resolveWebviewView() {
        if (!this.webview) {
            this.webview = this.createWebview();
            this.eventManager = this.createEventManager(this.webview);
        } else {
            this.webview.reveal();
        }
    }

    private createWebview(): vscode.WebviewPanel {
        const webview: vscode.WebviewPanel = vscode.window.createWebviewPanel(
            'jfrog.issues.details',
            'Vulnerability Details',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            {
                enableScripts: true,
                enableFindWidget: true,
                enableCommandUris: true
            }
        );
        webview.iconPath = vscode.Uri.file(this.context.asAbsolutePath(path.join('resources', 'extensionIcon.png')));
        webview.onDidDispose(
            () => {
                this.webview = undefined;
                this.eventManager = undefined;
            },
            undefined,
            this.context.subscriptions
        );
        return webview;
    }

    private createEventManager(webview: vscode.WebviewPanel) {
        const eventManager: EventManager = new EventManager(webview.webview, this.connectionManager, this._logManager);
        webview.onDidChangeViewState(() => {
            if (this.currentPage) {
                eventManager.loadPage(this.currentPage);
            }
        });
        return eventManager;
    }
}
