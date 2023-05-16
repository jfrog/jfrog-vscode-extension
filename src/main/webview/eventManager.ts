import { IdeEvent, IdeEventType, SetEmitterEvent, ShowPageEvent, WebviewEvent, WebviewPage, webviewEventType } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { ScanUtils } from '../utils/scanUtils';

export class WebviewEventManager {
    constructor(webview: vscode.Webview, disposables?: vscode.Disposable[]) {
        this.setEventEmitter(webview);
        this.setEventReceiver(webview, disposables);
    }

    private setEventReceiver(webview: vscode.Webview, disposables?: vscode.Disposable[]): void {
        webview.onDidReceiveMessage(
            (message: IdeEvent) => {
                switch (message.type) {
                    case IdeEventType.JUMP_TO_CODE:
                        ScanUtils.openFile(
                            message.data.file,
                            new vscode.Range(
                                message.data.startRow - 1,
                                message.data.startColumn - 1,
                                message.data.endRow - 1,
                                message.data.endColumn - 1
                            )
                        );
                }
            },
            undefined,
            disposables
        );
    }

    public async setEventEmitter(webview: vscode.Webview): Promise<void> {
        await this.sendEvent(webview, { type: webviewEventType.SetEmitter, emitterFunc: 'return acquireVsCodeApi().postMessage' } as SetEmitterEvent);
    }

    public async loadPage(webview: vscode.Webview, page: WebviewPage): Promise<void> {
        await this.sendEvent(webview, { type: webviewEventType.ShowPage, pageData: page } as ShowPageEvent);
    }

    private async sendEvent(webview: vscode.Webview, event: WebviewEvent): Promise<void> {
        await webview.postMessage(event);
    }
}
