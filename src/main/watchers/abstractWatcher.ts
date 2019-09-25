import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';

/**
 * @see WatcherManager
 */
export abstract class AbstractWatcher implements ExtensionComponent {
    constructor(protected _treesManager: TreesManager, private _globPattern: vscode.GlobPattern) {}

    onDidCreate(): void {
        this.onDidChange();
    }
    onDidChange(): void {
        this._treesManager.dependenciesTreeDataProvider.refresh(true);
    }
    onDidDelete(): void {
        this.onDidChange();
    }

    public activate(context: vscode.ExtensionContext) {
        let watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(this._globPattern, false, false, false);
        context.subscriptions.push(watcher.onDidCreate(() => this.onDidCreate()));
        context.subscriptions.push(watcher.onDidChange(() => this.onDidChange()));
        context.subscriptions.push(watcher.onDidDelete(() => this.onDidDelete()));
        context.subscriptions.push(watcher);
    }
}
