import { IdeEvent, IdeEventSetEmitter, IdeEventShowPage, IdeEventType, WebviewPage } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { LogManager } from '../../log/logManager';

/**
 * Sends events to the webview.
 */
export class EventSender {
    constructor(private webview: vscode.Webview, private logManager: LogManager) {
        this.setEventEmitter();
    }

    /**
     * Establishes the event emitter within the webview to enable sending messages from the webview back to the IDE.
     */
    public async setEventEmitter(): Promise<void> {
        await this.sendEvent(this.webview, {
            type: IdeEventType.SetEmitter,
            data: 'return acquireVsCodeApi().postMessage'
        } as IdeEventSetEmitter);
    }

    /**
     * Sends a loadPage event to the webview to display a specific page.
     */
    public async loadPage(page: WebviewPage): Promise<void> {
        const request: IdeEventShowPage = { type: IdeEventType.ShowPage, data: page };
        this.logManager.logMessage('Load webview with request data :\n' + JSON.stringify(request), 'DEBUG');
        await this.sendEvent(this.webview, request);
    }

    /**
     * Sends an event to the webview.
     * @private
     * @param webview - The webview to which the event will be sent.
     * @param event - The event to be sent.
     */
    private async sendEvent(webview: vscode.Webview, event: IdeEvent): Promise<void> {
        await webview.postMessage(event);
    }
}
