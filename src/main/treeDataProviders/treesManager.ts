import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ExtensionComponent } from '../extensionComponent';
import { LogManager } from '../log/logManager';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { ScanLogicManager } from '../scanLogic/scanLogicManager';
import { BuildsDataProvider } from './dependenciesTree/buildsDataProvider';
import { DependenciesTreeDataProvider } from './dependenciesTree/dependenciesDataProvider';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { DependencyDetailsProvider } from './dependencyDetailsProvider';
import { TreeDataProviderManager } from './dependenciesTree/treeDataProviderManager';
/*************************************************************
 * The following logic is part of the CVE applicability scan.*
 * It will be hidden until it is officially released.        *
 * ***********************************************************
 */
// import { SourceCodeTreeDataProvider } from './sourceCodeTree/sourceCodeTreeDataProvider';
// import { SourceCodeCveTreeNode } from './sourceCodeTree/sourceCodeCveNode';
// import { CveApplicabilityRoot } from './sourceCodeTree/CveApplicabilityRoot';
// import { SourceCodeFileTreeNode } from './sourceCodeTree/sourceCodeFileTreeNode';
// import { SourceCodeRootTreeNode } from './sourceCodeTree/sourceCodeRootTreeNode';

/**
 * Manages all 3 trees in the extension: Dependencies, Dependency details and Code vulnerability.
 */
export class TreesManager implements ExtensionComponent {
    private _dependenciesTreeView!: vscode.TreeView<DependenciesTreeNode>;
    /*************************************************************
     * The following logic is part of the CVE applicability scan.*
     * It will be hidden until it is officially released.        *
     * ***********************************************************
     */
    // private _sourceCodeTreeView!: vscode.TreeView<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot>;
    private _treeDataProviderManager: TreeDataProviderManager;
    private _dependenciesTreeDataProvider: DependenciesTreeDataProvider;
    private _buildsTreesProvider: BuildsDataProvider;
    private _dependencyDetailsProvider: DependencyDetailsProvider;
    /*************************************************************
     * The following logic is part of the CVE applicability scan.*
     * It will be hidden until it is officially released.        *
     * ***********************************************************
     */
    // private _sourceCodeTreeDataProvider: SourceCodeTreeDataProvider;
    private _state: State;

    constructor(
        workspaceFolders: vscode.WorkspaceFolder[],
        private _connectionManager: ConnectionManager,
        private _scanCacheManager: ScanCacheManager,
        scanLogicManager: ScanLogicManager,
        private _logManager: LogManager
    ) {
        this._dependenciesTreeDataProvider = new DependenciesTreeDataProvider(workspaceFolders, this, scanLogicManager);
        this._buildsTreesProvider = new BuildsDataProvider(this);
        /*************************************************************
         * The following logic is part of the CVE applicability scan.*
         * It will be hidden until it is officially released.        *
         * ***********************************************************
         */
        // this._sourceCodeTreeDataProvider = new SourceCodeTreeDataProvider(workspaceFolders, this);
        this._treeDataProviderManager = new TreeDataProviderManager(this);
        this._dependencyDetailsProvider = new DependencyDetailsProvider(
            _scanCacheManager
            /*************************************************************
             * The following logic is part of the CVE applicability scan.*
             * It will be hidden until it is officially released.        *
             * ***********************************************************
             */
            // , this._sourceCodeTreeDataProvider
        );
        this._state = State.Local;
    }

    public async activate(context: vscode.ExtensionContext): Promise<TreesManager> {
        this._treeDataProviderManager.refresh(true);
        this._dependenciesTreeView = vscode.window.createTreeView('jfrog.xray', {
            treeDataProvider: this._treeDataProviderManager,
            showCollapseAll: true
        });
        /*************************************************************
         * The following logic is part of the CVE applicability scan.*
         * It will be hidden until it is officially released.        *
         * ***********************************************************
         */
        // this._sourceCodeTreeView = vscode.window.createTreeView('jfrog.source.code.scan', {
        //     treeDataProvider: this._sourceCodeTreeDataProvider,
        //     showCollapseAll: false
        // });
        context.subscriptions.push(
            this._dependenciesTreeView,
            /*************************************************************
             * The following logic is part of the CVE applicability scan.*
             * It will be hidden until it is officially released.        *
             * ***********************************************************
             */
            // this._sourceCodeTreeView,
            vscode.window.registerTreeDataProvider('jfrog.xray.dependency.details', this._dependencyDetailsProvider)
        );
        return Promise.resolve(this);
    }

    public get dependencyDetailsProvider(): DependencyDetailsProvider {
        return this._dependencyDetailsProvider;
    }

    public set dependencyDetailsProvider(value: DependencyDetailsProvider) {
        this._dependencyDetailsProvider = value;
    }

    /*************************************************************
     * The following logic is part of the CVE applicability scan.*
     * It will be hidden until it is officially released.        *
     * ***********************************************************
     */
    // public get sourceCodeTreeView(): vscode.TreeView<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot> {
    //     return this._sourceCodeTreeView;
    // }

    public get dependenciesTreeView(): vscode.TreeView<DependenciesTreeNode> {
        return this._dependenciesTreeView;
    }

    get dependenciesTreeDataProvider(): DependenciesTreeDataProvider {
        return this._dependenciesTreeDataProvider;
    }

    /*************************************************************
     * The following logic is part of the CVE applicability scan.*
     * It will be hidden until it is officially released.        *
     * ***********************************************************
     */
    // get sourceCodeTreeDataProvider(): SourceCodeTreeDataProvider {
    //     return this._sourceCodeTreeDataProvider;
    // }

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

    public isLocalState(): boolean {
        return this._state === State.Local;
    }

    public isCiState(): boolean {
        return this._state === State.CI;
    }
}

export enum State {
    Local = 0,
    CI = 1
}
