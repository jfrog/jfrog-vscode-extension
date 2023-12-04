import { WebviewEvent, WebviewEventType, WebviewPage } from 'jfrog-ide-webview';
import { ConnectionManager } from '../../connect/connectionManager';
import { EventSender } from './eventSender';
import * as vscode from 'vscode';
import { LogManager } from '../../log/logManager';
import { LoginTask } from './tasks/login';
import { JumpToCodeTask } from './tasks/jumpToCode';
import { RunUtils } from '../../utils/runUtils';

/**
 * Manages events and communication between the extension and the webview.
 */
export class EventManager {
    protected send: EventSender;
    private webviewLoaded: boolean = false;
    private static TIMEOUT_THREE_MINUTES_IN_MS: number = 3 * 60 * 1000;
    private static RETRY_DELAY_TEN_MS: number = 3 * 60 * 1000;

    private constructor(webview: vscode.Webview, private connectionManager: ConnectionManager, private logManager: LogManager) {
        this.setEventReceiver(webview);
        this.send = new EventSender(webview, logManager);
    }

    public static async createEventManager(
        webview: vscode.Webview,
        connectionManager: ConnectionManager,
        logManager: LogManager
    ): Promise<EventManager> {
        const eventManager: EventManager = new EventManager(webview, connectionManager, logManager);
        await EventManager.waitUntilWebviewLoaded(eventManager);
        return eventManager;
    }

    private static async waitUntilWebviewLoaded(eventManager: EventManager) {
        const startedTime: number = Date.now();
        for (let i: number = 1; !EventManager.timedOut(startedTime) && !eventManager.webviewLoaded; i++) {
            eventManager.send.setEventEmitter();
            await RunUtils.delay(EventManager.RETRY_DELAY_TEN_MS * i);
        }
    }

    private static timedOut(startedTime: number) {
        return Date.now() - startedTime > EventManager.TIMEOUT_THREE_MINUTES_IN_MS;
    }

    /**
     * Loads a webview page by sending a loadPage event to the webview.
     */
    public loadPage(data: WebviewPage) {
        this.send.loadPage(data);
    }

    /**
     * Sets up a listener for event notification messages coming from the webview.
     * @param webview - The webview associated with the event receiver.
     * @param disposables - An optional array of disposables to manage event handlers.
     */
    private async setEventReceiver(webview: vscode.Webview, disposables?: vscode.Disposable[]): Promise<void> {
        webview.onDidReceiveMessage(
            async (message: WebviewEvent) => {
                switch (message.type) {
                    case WebviewEventType.JumpToCode:
                        new JumpToCodeTask(message.data, this.logManager).run();
                        break;
                    case WebviewEventType.Login:
                        await new LoginTask(this.send, message.data, this.connectionManager, this.logManager).run();
                        break;
                    case WebviewEventType.WebviewLoaded:
                        this.webviewLoaded = true;
                        break;
                }
            },
            undefined,
            disposables
        );
    }
}
