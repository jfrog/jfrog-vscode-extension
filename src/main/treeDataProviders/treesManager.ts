import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ExtensionComponent } from '../extensionComponent';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { ComponentDetailsDataProvider } from './componentDetailsDataProvider';
import { DependenciesTreeDataProvider } from './dependenciesTree/dependenciesDataProvider';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { IssuesDataProvider } from './issuesDataProvider';
import { LogManager } from '../log/logManager';
import {TreeDataProviderManager} from "./dependenciesTree/treeDataProviderManager";
import {BuildsDataProvider} from "./dependenciesTree/buildsDataProvider";

/**
 * Manages all 3 trees in the extension: Components, component details and component issues details.
 */
export class TreesManager implements ExtensionComponent {
    private _dependenciesTreeView!: vscode.TreeView<DependenciesTreeNode>;
    private _componentDetailsDataProvider: ComponentDetailsDataProvider;
    private _treeDataProviderManager: TreeDataProviderManager;
    private _dependenciesTreeDataProvider: DependenciesTreeDataProvider;
    private _buildsTreesProvider: BuildsDataProvider;
    private _issuesDataProvider: IssuesDataProvider;
    private _state: State;

    constructor(
        workspaceFolders: vscode.WorkspaceFolder[],
        private _connectionManager: ConnectionManager,
        private _scanCacheManager: ScanCacheManager,
        private _logManager: LogManager
    ) {
        this._dependenciesTreeDataProvider = new DependenciesTreeDataProvider(workspaceFolders, this);
        this._buildsTreesProvider = new BuildsDataProvider(this);
        this._treeDataProviderManager = new TreeDataProviderManager(this);
        this._componentDetailsDataProvider = new ComponentDetailsDataProvider();
        this._issuesDataProvider = new IssuesDataProvider();
        this._state = State.Local;
    }

    public async activate(context: vscode.ExtensionContext): Promise<TreesManager> {
        await this._treeDataProviderManager.refresh(true);
        this._dependenciesTreeView = vscode.window.createTreeView('jfrog.xray', {
            treeDataProvider: this._treeDataProviderManager,
            showCollapseAll: true
        });
        context.subscriptions.push(
            this._dependenciesTreeView,
            vscode.window.registerTreeDataProvider('jfrog.xray.component', this._componentDetailsDataProvider),
            vscode.window.registerTreeDataProvider('jfrog.xray.issues', this._issuesDataProvider)
        );
        return Promise.resolve(this);
    }

    public get componentDetailsDataProvider(): ComponentDetailsDataProvider {
        return this._componentDetailsDataProvider;
    }

    public get dependenciesTreeView(): vscode.TreeView<DependenciesTreeNode> {
        return this._dependenciesTreeView;
    }

    public get issuesDataProvider(): IssuesDataProvider {
        return this._issuesDataProvider;
    }

    get dependenciesTreeDataProvider(): DependenciesTreeDataProvider {
        return this._dependenciesTreeDataProvider;
    }

    public get connectionManager(): ConnectionManager {
        return this._connectionManager;
    }

    public get scanCacheManager(): ScanCacheManager {
        return this._scanCacheManager;
    }

    public get logManager(): LogManager {
        return this._logManager;
    }

    public get state(): State {
        return this._state;
    }

    public set state(value: State) {
        this._state = value;
    }

    get buildsTreesProvider(): BuildsDataProvider {
        return this._buildsTreesProvider;
    }

    set buildsTreesProvider(value: BuildsDataProvider) {
        this._buildsTreesProvider = value;
    }

    public get treeDataProviderManager(): TreeDataProviderManager {
        return this._treeDataProviderManager;
    }

    public set treeDataProviderManager(value: TreeDataProviderManager) {
        this._treeDataProviderManager = value;
    }

    public isLocalState():boolean {
        return this._state === State.Local;
    }

    public isCiState():boolean {
        return this._state === State.CI;
    }
}

export enum State {
    Local = 0,
    CI = 1
}
