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
    private panel: vscode.WebviewPanel | undefined;

    constructor(logManager: LogManager, private connectionManager: ConnectionManager, private context: vscode.ExtensionContext) {
        super(logManager);
    }

    /**
     * Create if not exists or update the webview panel with the given page data and show it in the editor
     * @param data - the data of the page to be update and show in the webpage
     * @param context - context of the extension
     */
    public async resolveWebviewView() {
        if (!this.panel) {
            this.panel = this.createWebview();
            this.eventManager = await this.createEventManager(this.panel);
        } else {
            this.panel.reveal();
        }
    }

    /**
     * Close, if exists, an open webview page
     */
    public closeWebview() {
        this.currentPage = undefined;
        this.panel?.dispose();
    }

    private createWebview(): vscode.WebviewPanel {
        const panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
            'jfrog.issues.details',
            'Vulnerability Details',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
            {
                enableScripts: true,
                enableFindWidget: true,
                enableCommandUris: true
            }
        );
        panel.iconPath = vscode.Uri.file(this.context.asAbsolutePath(path.join('resources', 'extensionIcon.png')));
        panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.eventManager = undefined;
            },
            undefined,
            this.context.subscriptions
        );
        panel.webview.html = this.getHtml(this.context, panel.webview);
        return panel;
    }

    private async createEventManager(panel: vscode.WebviewPanel) {
        const eventManager: EventManager = await EventManager.createEventManager(panel.webview, this.connectionManager, this._logManager);
        panel.onDidChangeViewState(() => {
            if (this.currentPage) {
                eventManager.loadPage(this.currentPage);
            }
        });
        return eventManager;
    }
}
