import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';
import { IDependencyPage, IZeroDayPage } from 'jfrog-ide-webview';
import { LogManager } from '../log/logManager';

/**
 * Show a webview panel with details about objects in the project
 */
export class DetailsWebView {
    constructor(private _logManager: LogManager) {}

    private _panel: vscode.WebviewPanel | undefined; 
    private _currentData: any;

    public async activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('jfrog.view.dependency.details.page', (page: IDependencyPage) => this.updateWebview(page,'Vulnerability Details',context)),
            vscode.commands.registerCommand('jfrog.view.eos.page', (page: IZeroDayPage) => this.updateWebview(page,'Eos Details',context))
        );
    }

    public updateWebview(data: any, title: string, context: vscode.ExtensionContext) {
        if (!this._panel) {
            this._panel = createWebview(title,context);
            this._panel.onDidChangeViewState(e => {
                updateWebview(e.webviewPanel, this._currentData);
            });
            this._panel.onDidDispose(
                () => {
                    this._panel = undefined;
                },
                undefined,
                context.subscriptions
            );
        } else {
            this._panel.title = title;
            this._panel.reveal();
        }
    
        if (data && this._currentData !== data) {
            this._logManager.logMessage('Opening webview with data:\n' + JSON.stringify(data), 'DEBUG');
            updateWebview(this._panel, data);
        }
        this._currentData = data;
    }
}

function updateWebview(panel: vscode.WebviewPanel, page: any) {
    panel.webview.postMessage({
        data: page
    });
}

function createWebview(title: string, context: vscode.ExtensionContext) {
    // Create and show panel
    let panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
        'jfrog.issues.details',
        title,
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
    panel.webview.html = getHtmlForWebview(context, panel.webview);
    return panel;
}

function getHtmlForWebview(context: vscode.ExtensionContext, webview: vscode.Webview) {
    const data: string = fs.readFileSync(context.asAbsolutePath(path.join('dist', 'jfrog-ide-webview', 'index.html')), {
        encoding: 'utf8'
    });
    const webviewDataPath: vscode.Uri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'dist', 'jfrog-ide-webview')));
    return data.replace(/\.\/static/g, `${webviewDataPath}/static`);
}
