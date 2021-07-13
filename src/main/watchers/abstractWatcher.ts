import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';

/**
 * @see WatcherManager
 */
export abstract class AbstractWatcher implements ExtensionComponent {
    constructor(protected _treesManager: TreesManager, private _globPattern: vscode.GlobPattern) {}

    onDidChange(): void {
        this._treesManager.treeDataProviderManager.refresh(true);
    }

    public activate(context: vscode.ExtensionContext) {
        let watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(this._globPattern);
        context.subscriptions.push(watcher.onDidCreate(() => this.onDidChange()));
        context.subscriptions.push(watcher.onDidChange(() => this.onDidChange()));
        context.subscriptions.push(watcher.onDidDelete(() => this.onDidChange()));
        context.subscriptions.push(watcher);
    }
}
