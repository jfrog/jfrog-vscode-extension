import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ExtensionComponent } from '../extensionComponent';
import { LogManager } from '../log/logManager';
import { ScanCacheManager } from '../cache/scanCacheManager';
// import { ScanLogicManager } from '../scanLogic/scanLogicManager';
import { BuildsDataProvider } from './dependenciesTree/buildsDataProvider';
// import { DependenciesTreeDataProvider } from './dependenciesTree/dependenciesDataProvider';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { DependencyDetailsProvider } from './dependencyDetailsProvider';
// import { TreeDataProviderManager } from './dependenciesTree/treeDataProviderManager';
// import { SourceCodeTreeDataProvider } from './sourceCodeTree/sourceCodeTreeDataProvider';
// import { SourceCodeCveTreeNode } from './sourceCodeTree/sourceCodeCveNode';
// import { CveApplicabilityRoot } from './sourceCodeTree/cveApplicabilityRoot';
// import { SourceCodeFileTreeNode } from './sourceCodeTree/sourceCodeFileTreeNode';
// import { SourceCodeRootTreeNode } from './sourceCodeTree/sourceCodeRootTreeNode';
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

    // private _sourceCodeTreeView!: vscode.TreeView<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot>;
    private _issuesTreeView!: vscode.TreeView<IssuesRootTreeNode | FileTreeNode | IssueTreeNode | DependencyIssuesTreeNode>;
    private _issuesTreeDataProvider: IssuesTreeDataProvider;
    // private _treeDataProviderManager: TreeDataProviderManager;
    // private _dependenciesTreeDataProvider: DependenciesTreeDataProvider;

    private _dependencyDetailsProvider: DependencyDetailsProvider;
    // private _sourceCodeTreeDataProvider: SourceCodeTreeDataProvider;
    private _state: State;

    constructor(
        /*private*/ workspaceFolders: vscode.WorkspaceFolder[],
        private _connectionManager: ConnectionManager,
        private _scanCacheManager: ScanCacheManager, // tobe deleted when refactoring builds
        // scanLogicManager: ScanLogicManager,
        private _scanManager: ScanManager,
        private _cacheManager: CacheManager,
        private _logManager: LogManager
    ) {
        // this._dependenciesTreeDataProvider = new DependenciesTreeDataProvider(workspaceFolders, this, scanLogicManager);
        this._buildsTreesProvider = new BuildsDataProvider(this);
        // this._sourceCodeTreeDataProvider = new SourceCodeTreeDataProvider(workspaceFolders, this);
        // this._treeDataProviderManager = new TreeDataProviderManager(this);
        this._dependencyDetailsProvider = new DependencyDetailsProvider(_scanCacheManager);

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
            showCollapseAll: false
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

    public set state(value: State) {
        this._state = value;
        if (this._state === State.Local) {
            this.issuesTreeDataProvider.refresh(false);
            // this._treesManager.issuesTreeDataProvider.refresh()
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

    // public get sourceCodeTreeView(): vscode.TreeView<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot> {
    //     return this._sourceCodeTreeView;
    // }

    // public get dependenciesTreeView(): vscode.TreeView<DependenciesTreeNode> {
    //     return this._ciTreeView;
    // }

    // get dependenciesTreeDataProvider(): DependenciesTreeDataProvider {
    //     return this._dependenciesTreeDataProvider;
    // }

    // get sourceCodeTreeDataProvider(): SourceCodeTreeDataProvider {
    //     return this._sourceCodeTreeDataProvider;
    // }

    public get connectionManager(): ConnectionManager {
        return this._connectionManager;
    }

    public get scanManager(): ScanManager {
        return this._scanManager;
    }

    public get cacheManager(): CacheManager {
        return this._cacheManager;
    }

    public get scanCacheManager(): ScanCacheManager {
        return this._scanCacheManager;
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

    // public get treeDataProviderManager(): TreeDataProviderManager {
    //     return this._treeDataProviderManager;
    // }

    // public set treeDataProviderManager(value: TreeDataProviderManager) {
    //     this._treeDataProviderManager = value;
    // }
}
