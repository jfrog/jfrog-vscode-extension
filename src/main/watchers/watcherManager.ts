import * as vscode from 'vscode';
import { AbstractWatcher } from './abstractWatcher';
import { NpmWatcher } from './npmWatcher';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ExtensionComponent } from '../extensionComponent';
import { GoWatcher } from './goWatcher';

/**
 * Listen to project descriptor (i.e package-lock.json) changes and perform Xray scan on a change.
 */
export class WatcherManager implements ExtensionComponent {
    private _watchers: AbstractWatcher[] = [];

    constructor(treesManager: TreesManager) {
        this._watchers.push(new NpmWatcher(treesManager), new GoWatcher(treesManager));
    }

    public activate(context: vscode.ExtensionContext): WatcherManager {
        this._watchers.forEach(watcher => watcher.activate(context));
        return this;
    }
}
