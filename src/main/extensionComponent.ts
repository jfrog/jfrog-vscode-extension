import * as vscode from 'vscode';

export interface ExtensionComponent {
    /**
     * Activate a component.
     * Any extension component must add its disposables to the context.subscriptions for later clean up.
     * @param context - The extension context. @see vscode.ExtensionContext.
     */
    activate(context: vscode.ExtensionContext): any;
}
