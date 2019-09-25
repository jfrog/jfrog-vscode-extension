import * as vscode from 'vscode';

export class SetCredentialsNode extends vscode.TreeItem {
    private static readonly SET_CREDENTIALS_MESSAGE: string = 'To start using the JFrog extension, please configure your JFrog Xray details';
    constructor() {
        super(SetCredentialsNode.SET_CREDENTIALS_MESSAGE, vscode.TreeItemCollapsibleState.Expanded);
    }
}
