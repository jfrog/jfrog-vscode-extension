import * as vscode from 'vscode';
import * as sinon from 'sinon';

export class MockWebview implements vscode.Webview {
    public options: vscode.WebviewOptions;
    public html: string;
    public onDidReceiveMessage: vscode.Event<any>;
    public postMessage: (message: any) => Thenable<boolean>;
    public asWebviewUri: (resource: vscode.Uri) => vscode.Uri;
    public cspSource: string;

    constructor(options: vscode.WebviewOptions = {}) {
        this.options = options;
        this.html = '';
        this.onDidReceiveMessage = new vscode.EventEmitter<any>().event;
        this.postMessage = sinon.stub().resolves(true);
        this.asWebviewUri = sinon.stub().returns(vscode.Uri.parse(''));
        this.cspSource = '';
    }
}
