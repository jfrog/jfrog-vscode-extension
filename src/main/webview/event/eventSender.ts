import { WebviewPage, WebviewReceiveEventType, WebviewReceiveEvent, ReceiveSetEmitterEvent, ReceiveShowPageEvent } from 'jfrog-ide-webview';
import * as vscode from 'vscode';

/**
 * Sends events to the webview.
 */
export class EventSender {
    constructor(private webview: vscode.Webview) {
        this.setEventEmitter();
    }

    /**
     * Establishes the event emitter within the webview to enable sending messages from the webview back to the IDE.
     */
    public async setEventEmitter(): Promise<void> {
        await this.sendEvent(this.webview, {
            type: WebviewReceiveEventType.SetEmitter,
            emitterFunc: 'return acquireVsCodeApi().postMessage'
        } as ReceiveSetEmitterEvent);
    }

    /**
     * Sends a loadPage event to the webview to display a specific page.
     */
    public async loadPage(page: WebviewPage): Promise<void> {
        await this.sendEvent(this.webview, { type: WebviewReceiveEventType.ShowPage, pageData: page } as ReceiveShowPageEvent);
    }

    /**
     * Sends an event to the webview.
     * @private
     * @param webview - The webview to which the event will be sent.
     * @param event - The event to be sent.
     */
    private async sendEvent(webview: vscode.Webview, event: WebviewReceiveEvent): Promise<void> {
        await webview.postMessage(event);
    }
}
