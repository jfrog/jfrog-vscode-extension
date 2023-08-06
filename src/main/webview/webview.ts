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
            this.eventManager.loadPage(this.currentPage);
        }
    }
}
