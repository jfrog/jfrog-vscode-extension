import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';
import { IDependencyPage } from 'jfrog-ide-webview';
import { PageType } from 'jfrog-ide-webview';
import { LogManager } from '../log/logManager';

/**
 * Show a webview panel with details about objects in the project
 */
export class DetailsWebView {
    constructor(private _logManager: LogManager) {}

    public async activate(context: vscode.ExtensionContext) {
        let panel: vscode.WebviewPanel | undefined;
        let prevActiveTreeNode: IDependencyPage;

        context.subscriptions.push(
            vscode.commands.registerCommand('jfrog.view.dependency.details.page', (page: IDependencyPage) => {
                if (!panel) {
                    panel = createWebview(context);
                    panel.onDidChangeViewState(e => {
                        updateWebview(e.webviewPanel, prevActiveTreeNode);
                    });
                    panel.onDidDispose(
                        () => {
                            panel = undefined;
                        },
                        undefined,
                        context.subscriptions
                    );
                } else {
                    panel.reveal();
                }

                if (page && prevActiveTreeNode !== page) {
                    this._logManager.logMessage('Opening webview page with data:\n' + JSON.stringify(page), 'DEBUG');
                    updateWebview(panel, page);
                }
                prevActiveTreeNode = page;
            })
        );
    }
}

function updateWebview(panel: vscode.WebviewPanel, page: IDependencyPage) {
    panel.webview.postMessage({
        data: page,
        pageType: PageType.Dependency
    });
}

function createWebview(context: vscode.ExtensionContext) {
    // Create and show panel
    let panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
        'jfrog.vulnerability.details',
        'Vulnerability Details',
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
    const data: string = fs.readFileSync(context.asAbsolutePath(path.join('dist', 'jfrog-ide-webview', 'build', 'index.html')), {
        encoding: 'utf8'
    });
    const webviewDataPath: vscode.Uri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'dist', 'jfrog-ide-webview', 'build'))
    );
    return data.replace(/\/static/g, `${webviewDataPath}/static`);
}
