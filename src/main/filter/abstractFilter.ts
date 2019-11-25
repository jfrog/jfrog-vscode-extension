import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { FilterManager } from './filterManager';

/**
 * @see FilterManager
 */
export abstract class AbstractFilter {
    protected _choice: vscode.QuickPickItem[] | undefined;

    /**
     * Get all filter values
     */
    protected abstract getValues(): vscode.QuickPickItem[];

    /**
     * Get a dependencies tree node and return true iff the node doesn't filtered out.
     * @param dependenciesTreeNode - The dependencies tree node
     */
    public abstract isNodePicked(dependenciesTreeNode: DependenciesTreeNode): boolean;

    public showFilterMenu(filterManager: FilterManager) {
        let quickPick: vscode.QuickPick<vscode.QuickPickItem> = vscode.window.createQuickPick();
        // Set items
        quickPick.items = this.getValues();
        quickPick.selectedItems = quickPick.items.filter(item => this.isPicked(item.label));
        quickPick.canSelectMany = true;

        // Set listeners
        quickPick.onDidChangeSelection(items => {
            this._choice = items;
            filterManager.applyFilters();
        });
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
