import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';
import { IDependencyPage, IEosPage } from 'jfrog-ide-webview';
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
            vscode.commands.registerCommand('jfrog.view.details.page', (page: IDependencyPage | IEosPage) => this.updateWebview(page, context))
        );
    }

    /**
     * Create if not exists or update the webview panel with the given page data and show it in the editor
     * @param data - the data of the page to be update and show in the webpage
     * @param context - context of the extension
     */
    public updateWebview(data: any, context: vscode.ExtensionContext) {
        if (!this._panel) {
            this._panel = createWebview(context);
            this._panel.onDidChangeViewState((webviewChanged: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
                postPageToWebview(webviewChanged.webviewPanel, this._currentData);
            });
            this._panel.onDidDispose(
                () => {
                    this._panel = undefined;
                },
                undefined,
                context.subscriptions
            );
        } else {
            this._panel.reveal();
        }

        if (data && this._currentData !== data) {
            this._logManager.logMessage('Opening webview with data:\n' + JSON.stringify(data), 'DEBUG');
            postPageToWebview(this._panel, data);
        }
        this._currentData = data;
    }
}

/**
 * Update the given panel to show the given page
 * @param panel - the webview panel that holds the pages
 * @param page - the page to show
 */
function postPageToWebview(panel: vscode.WebviewPanel, page: any) {
    panel.webview.postMessage({
        data: page
    });
}

function createWebview(context: vscode.ExtensionContext) {
    // Create and show panel
    let panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
        'jfrog.issues.details',
        'Vulnerability Details',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
            // Enable scripts in the webview
            enableScripts: true,
            enableFindWidget: true,
            enableCommandUris: true
        }
    );
    panel.webview.onDidReceiveMessage(  
    message => {  
      switch (message.command) {  
        case 'reverse_click':  
            vscode.window.showTextDocument(vscode.Uri.file(message.fileName), {  
                viewColumn: vscode.ViewColumn.One,  
  selection: new vscode.Range(new vscode.Position(+message.line - 1, 0), new vscode.Position(+message.line - 1, 0))  
            });  
 return;  }  
    },  
 undefined,  context.subscriptions  
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
