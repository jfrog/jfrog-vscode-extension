import * as vscode from 'vscode';
import * as path from 'path';
// import { VulnerabilityNode } from '../treeDataProviders/issuesDataProvider';
import { IDependencyPage } from 'jfrog-ide-webview';
// import { SeverityUtils } from '../types/severity';
import { PageType } from 'jfrog-ide-webview';
// import { CveTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/cveTreeNode';

export class CveDetailsView {
    public async activate(context: vscode.ExtensionContext) {
        let panel: vscode.WebviewPanel | undefined;
        context.subscriptions.push(
            vscode.commands.registerCommand('view.dependency.details.page', (page: IDependencyPage) => {
                if (!panel) {
                    panel = createWebview(context);
                }
                if (page) {
                    panel.webview.postMessage({
                        data: page,
                        pageType: PageType.Dependency
                    });
                }
                panel.onDidDispose(
                    () => {
                        panel = undefined;
                    },
                    undefined,
                    context.subscriptions
                );
            })
        );
    }
}

function createWebview(context: vscode.ExtensionContext) {
    // Create and show panel
    let panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
        'vulnerability.details',
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
    const scriptPathOnDisk: vscode.Uri = vscode.Uri.file(context.asAbsolutePath(path.join('dist', 'index.js')));
    const scriptUri: vscode.Uri = webview.asWebviewUri(scriptPathOnDisk);
    const nonce: string = getNonce();
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <base href="${vscode.Uri.file(context.asAbsolutePath('dist')).with({ scheme: 'vscode-resource' })}/">
        </head>

        <body style="padding:0;">
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
}

function getNonce(): string {
    let text: string = '';
    const possible: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i: number = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
