import * as vscode from 'vscode';
import { BaseFileTreeNode } from '../treeDataProviders/issuesTree/baseFileTreeNode';
import { IssuesFilterManager } from './issuesFilterManager';



/**
 * @see IssuesFilterManager
 */
 export abstract class AbstractNodeFilter {
    protected _choice: vscode.QuickPickItem[] | undefined;

    /**
     * Get all filter values
     */
    protected abstract getValues(): vscode.QuickPickItem[];

    /**
     * Get a dependencies tree node and return true iff the node doesn't filtered out.
     * @param dependenciesTreeNode - The dependencies tree node
     */
    public abstract isNodePicked(node: BaseFileTreeNode): boolean;

    public showFilterMenu(filterManager: IssuesFilterManager) {
        let quickPick: vscode.QuickPick<vscode.QuickPickItem> = vscode.window.createQuickPick();
        // Set items
        quickPick.items = this.getValues();
        quickPick.selectedItems = quickPick.items.filter(item => this.isPicked(item.label));
        quickPick.canSelectMany = true;

        // Set listeners
        // quickPick.onDidChangeSelection(items => {
        //     this._choice = items.map(el => el);
        //     filterManager.applyFilters();
        // });
        quickPick.onDidAccept(() => quickPick.hide());
        quickPick.onDidHide(() => quickPick.dispose());

        // Show quick pick
        quickPick.show();
    }

    public get choice() {
        return this._choice;
    }

    public clearFilters() {
        this._choice = undefined;
    }

    public isPicked(item: string): boolean {
        return !this.choice || this.choice.map(choice => choice.label).some(label => label === item);
    }
 }