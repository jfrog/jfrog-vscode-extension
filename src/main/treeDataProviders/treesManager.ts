import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ExtensionComponent } from '../extensionComponent';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { ComponentDetailsDataProvider } from './componentDetailsDataProvider';
import { DependenciesTreeDataProvider } from './dependenciesTree/dependenciesDataProvider';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { IssuesDataProvider } from './issuesDataProvider';
import { LogManager } from '../log/logManager';

/**
 * Manages all 3 trees in the extension: Components, component details and component issues details.
 */
export class TreesManager implements ExtensionComponent {
    private _dependenciesTreeView!: vscode.TreeView<DependenciesTreeNode>;
    private _componentDetailsDataProvider: ComponentDetailsDataProvider;
    private _dependenciesDataProvider: DependenciesTreeDataProvider;
    private _issuesDataProvider: IssuesDataProvider;

    constructor(
        workspaceFolders: vscode.WorkspaceFolder[],
        private _connectionManager: ConnectionManager,
        private _scanCacheManager: ScanCacheManager,
        private _logManager: LogManager
    ) {
        this._dependenciesDataProvider = new DependenciesTreeDataProvider(workspaceFolders, this);
        this._componentDetailsDataProvider = new ComponentDetailsDataProvider();
        this._issuesDataProvider = new IssuesDataProvider();
    }

    public async activate(context: vscode.ExtensionContext): Promise<TreesManager> {
        await this._dependenciesDataProvider.refresh(true);
        this._dependenciesTreeView = vscode.window.createTreeView('jfrog.xray', {
            treeDataProvider: this._dependenciesDataProvider,
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

    public get dependenciesTreeDataProvider(): DependenciesTreeDataProvider {
        return this._dependenciesDataProvider;
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
}
