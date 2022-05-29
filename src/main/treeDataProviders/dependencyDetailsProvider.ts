import * as vscode from 'vscode';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { GeneralDetailsDataProvider } from './generalDetailsDataProvider';
import { DependenciesTreeNode } from './dependenciesTree/dependenciesTreeNode';
import { IssueNode, IssuesDataProvider } from './issuesDataProvider';
/*************************************************************
 * The following logic is part of the CVE applicability scan.*
 * It will be hidden until it is officially released.        *
 * ***********************************************************
 */
// import { SourceCodeTreeDataProvider } from './sourceCodeTree/sourceCodeTreeDataProvider';

/**
 * Dependency Details panel.
 */
export class DependencyDetailsProvider implements vscode.TreeDataProvider<any> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;
    private _issuesDataProvider: IssuesDataProvider;
    private _generalDetailsProvider: GeneralDetailsDataProvider;
    private _selectedNode: DependenciesTreeNode | undefined;

    constructor(
        /*************************************************************
         * The following logic is part of the CVE applicability scan.*
         * It will be hidden until it is officially released.        *
         * ***********************************************************
         */
        protected _scanCacheManager: ScanCacheManager // , sourceCodeTreeDataProvider: SourceCodeTreeDataProvider
    ) {
        this._issuesDataProvider = new IssuesDataProvider(
            _scanCacheManager
            /*************************************************************
             * The following logic is part of the CVE applicability scan.*
             * It will be hidden until it is officially released.        *
             * ***********************************************************
             */
            // , sourceCodeTreeDataProvider
        );
        this._generalDetailsProvider = new GeneralDetailsDataProvider(_scanCacheManager);
    }

    getTreeItem(element: any): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof IssueNode) {
            return this._issuesDataProvider.getTreeItem(element);
        }
        return this._generalDetailsProvider.getTreeItem(element);
    }

    getChildren(element?: any): Thenable<any[]> {
        // No selected node - No component details view
        if (!this._selectedNode) {
            return Promise.resolve([]);
        }
        if (!element) {
            // The node from the dependencies tree is selected.
            // Get 'Dependency Details' data to be Displayed.
            return this._issuesDataProvider.getChildren(element).then(r => {
                if (r.length > 0) {
                    return Promise.resolve([this._generalDetailsProvider, this._issuesDataProvider]);
                }
                return Promise.resolve([this._generalDetailsProvider]);
            });
        }
        if (element instanceof IssueNode) {
            // The node from 'Dependency Details' is selected.
            return Promise.resolve(this._issuesDataProvider.getChildren(element));
        }
        return Promise.resolve(this._generalDetailsProvider.getChildren(element));
    }

    /**
     * Select node in Component Issues Details after selecting a node in the Components Tree.
     * @param selectedNode - the selected node in the DependenciesTreeNode.
     */
    public selectNode(selectedNode: DependenciesTreeNode): void {
        this._selectedNode = selectedNode;
        this._issuesDataProvider.selectedNode = selectedNode;
        this._generalDetailsProvider.selectedNode = selectedNode;
        this.refresh();
    }

    public get issuesDataProvider(): IssuesDataProvider {
        return this._issuesDataProvider;
    }

    public get generalDetailsProvider(): GeneralDetailsDataProvider {
        return this._generalDetailsProvider;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
