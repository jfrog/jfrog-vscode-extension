import { WebviewPage, WebviewSendEvent, WebviewSendEventType } from 'jfrog-ide-webview';
import { ConnectionManager } from '../../connect/connectionManager';
import { EventSender } from './eventSender';
import * as vscode from 'vscode';
import { LogManager } from '../../log/logManager';
import { LoginTask } from './tasks/login';
import { JumpToCodeTask } from './tasks/jumpToCode';

/**
 * Manages events and communication between the extension and the webview.
 */
export class EventManager {
    protected send: EventSender;

    constructor(webview: vscode.Webview, private connectionManager: ConnectionManager, private logManager: LogManager) {
        this.send = new EventSender(webview);
        this.setEventReceiver(webview);
    }

    /**
     * Loads a webview page by sending a loadPage event to the webview.
     */
    public loadPage(data: WebviewPage) {
        this.send.loadPage(data);
    }

    /**
     * Sets up a listener for event notification messages coming from the webview.
     * @private
     * @param webview - The webview associated with the event receiver.
     * @param disposables - An optional array of disposables to manage event handlers.
     */
    private async setEventReceiver(webview: vscode.Webview, disposables?: vscode.Disposable[]): Promise<void> {
        webview.onDidReceiveMessage(
            async (message: WebviewSendEvent) => {
                switch (message.type) {
                    case WebviewSendEventType.JumpToCode:
                        new JumpToCodeTask(message.data, this.logManager).run();
                        break;
                    case WebviewSendEventType.Login:
                        await new LoginTask(this.send, message.data, this.connectionManager, this.logManager).run();
                }
            },
            undefined,
            disposables
        );
    }
}
