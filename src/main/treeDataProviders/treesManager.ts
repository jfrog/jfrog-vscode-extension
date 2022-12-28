import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ExtensionComponent } from '../extensionComponent';
import { LogManager } from '../log/logManager';
import { ScanCacheManager } from '../cache/scanCacheManager';
import { BuildsDataProvider } from './dependenciesTree/buildsDataProvider';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { DependencyDetailsProvider } from './dependencyDetailsProvider';
import { IssuesTreeDataProvider } from './issuesTree/issuesTreeDataProvider';
import { FileTreeNode } from './issuesTree/fileTreeNode';
import { ScanManager } from '../scanLogic/scanManager';
import { IssuesRootTreeNode } from './issuesTree/issuesRootTreeNode';
import { CacheManager } from '../cache/cacheManager';
import { IssueTreeNode } from './issuesTree/issueTreeNode';
import { DependencyIssuesTreeNode } from './issuesTree/descriptorTree/dependencyIssuesTreeNode';

export enum State {
    Local = 0,
    CI = 1
}

/**
 * Manages all the trees in the extension: Builds (CI state), Issues (Local state).
 */
export class TreesManager implements ExtensionComponent {
    private _ciTreeView!: vscode.TreeView<DependenciesTreeNode>;
    private _buildsTreesProvider: BuildsDataProvider;

    private _issuesTreeView!: vscode.TreeView<IssuesRootTreeNode | FileTreeNode | IssueTreeNode | DependencyIssuesTreeNode>;
    private _issuesTreeDataProvider: IssuesTreeDataProvider;

    private _dependencyDetailsProvider: DependencyDetailsProvider;
    private _state: State;

    constructor(
        workspaceFolders: vscode.WorkspaceFolder[],
        private _connectionManager: ConnectionManager,
        scanCacheManager: ScanCacheManager,
        private _scanManager: ScanManager,
        private _cacheManager: CacheManager,
        private _logManager: LogManager
    ) {
        this._buildsTreesProvider = new BuildsDataProvider(this, scanCacheManager);
        this._dependencyDetailsProvider = new DependencyDetailsProvider(scanCacheManager);

        this._issuesTreeDataProvider = new IssuesTreeDataProvider(workspaceFolders, _logManager, _scanManager, _cacheManager, this);
        this._state = State.Local;
    }

    public async activate(context: vscode.ExtensionContext): Promise<TreesManager> {
        this._ciTreeView = vscode.window.createTreeView('jfrog.xray.ci.issues', {
            treeDataProvider: this._buildsTreesProvider,
            showCollapseAll: true
        });
        this._issuesTreeView = vscode.window.createTreeView('jfrog.xray.issues', {
            treeDataProvider: this._issuesTreeDataProvider,
            showCollapseAll: true
        });
        context.subscriptions.push(
            this._ciTreeView,
            this._issuesTreeView,
            vscode.window.registerTreeDataProvider('jfrog.xray.ci.issues.details', this._dependencyDetailsProvider)
        );
        return Promise.resolve(this).finally(() => this.issuesTreeDataProvider.refresh(false));
    }

    public async refresh(scan: boolean = true) {
        if (this.isLocalState()) {
            await this.issuesTreeDataProvider.refresh(scan);
        } else {
            this.buildsTreesProvider.refresh(!scan);
        }
    }

    /**
     * Shows a specific node in the source code tree after clicking on the bulb icon in the source code.
     * @param sourceCodeCveTreeNode
     */
    public selectItemOnIssuesTree(item: FileTreeNode | IssueTreeNode | DependencyIssuesTreeNode) {
        this._issuesTreeView.reveal(item, { focus: true, select: true, expand: true });
    }

    public set state(value: State) {
        this._state = value;
        if (this._state === State.Local) {
            this.issuesTreeDataProvider.refresh(false);
        } else {
            this._buildsTreesProvider.stateChange();
        }
    }

    public get state(): State {
        return this._state;
    }

    public isLocalState(): boolean {
        return this._state === State.Local;
    }

    public isCiState(): boolean {
        return this._state === State.CI;
    }

    get issuesTreeView(): vscode.TreeView<IssuesRootTreeNode | FileTreeNode | IssueTreeNode | DependencyIssuesTreeNode> {
        return this._issuesTreeView;
    }

    public get issuesTreeDataProvider(): IssuesTreeDataProvider {
        return this._issuesTreeDataProvider;
    }

    public get dependencyDetailsProvider(): DependencyDetailsProvider {
        return this._dependencyDetailsProvider;
    }

    public set dependencyDetailsProvider(value: DependencyDetailsProvider) {
        this._dependencyDetailsProvider = value;
    }

    public get connectionManager(): ConnectionManager {
        return this._connectionManager;
    }

    public get scanManager(): ScanManager {
        return this._scanManager;
    }

    public get cacheManager(): CacheManager {
        return this._cacheManager;
    }

    public get logManager(): LogManager {
        return this._logManager;
    }

    get buildsTreesProvider(): BuildsDataProvider {
        return this._buildsTreesProvider;
    }

    set buildsTreesProvider(value: BuildsDataProvider) {
        this._buildsTreesProvider = value;
    }
}
