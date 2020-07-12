import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ExtensionComponent } from '../extensionComponent';
import { FilterManager } from '../filter/filterManager';
import { FocusManager } from '../focus/focusManager';
import { LogManager } from '../log/logManager';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ExclusionsManager } from '../exclusions/exclusionsManager';

/**
 * Register and execute all commands in the extension.
 */
export class CommandManager implements ExtensionComponent {
    constructor(
        private _logManager: LogManager,
        private _connectionManager: ConnectionManager,
        private _treesManager: TreesManager,
        private _filterManager: FilterManager,
        private _focusManager: FocusManager,
        private _exclusionManager: ExclusionsManager
    ) {}

    public activate(context: vscode.ExtensionContext) {
        this.registerCommand(context, 'jfrog.xray.showInProjectDesc', dependenciesTreeNode => this.doShowInProjectDesc(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.excludeDependency', dependenciesTreeNode => this.doExcludeDependency(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.codeAction', dependenciesTreeNode => this.doCodeAction(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.focus', dependenciesTreeNode => this.doFocus(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.showOutput', () => this.showOutput());
        this.registerCommand(context, 'jfrog.xray.refresh', () => this.doRefresh());
        this.registerCommand(context, 'jfrog.xray.connect', () => this.doConnect());
        this.registerCommand(context, 'jfrog.xray.disconnect', () => this.doDisconnect());
        this.registerCommand(context, 'jfrog.xray.filter', () => this.doFilter());
        this.registerCommand(context, 'jfrog.xray.openLink', url => this.doOpenLink(url));
    }

    /**
     * Show the dependency in the project descriptor (i.e package.json) file after right click on the components tree and a left click on "Show in project descriptor".
     * @param dependenciesTreeNode - The dependency to show.
     */
    private doShowInProjectDesc(dependenciesTreeNode: DependenciesTreeNode) {
        this._focusManager.focusOnDependency(dependenciesTreeNode);
        this.onSelectNode(dependenciesTreeNode);
    }

    private doExcludeDependency(dependenciesTreeNode: DependenciesTreeNode) {
        this._exclusionManager.excludeDependency(dependenciesTreeNode);
    }

    /**
     * Open a webpage with the desired url.
     * @param url - The url to be opened.
     */
    private doOpenLink(url: string) {
        if (!url) {
            return;
        }
        vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
    }

    /**
     * Select node in the components tree after a click on the yellow bulb. (The opposite action of @function doShowInProjectDesc ).
     * @param dependenciesTreeNode - The dependency to show.
     */
    private doCodeAction(dependenciesTreeNode: DependenciesTreeNode) {
        this._treesManager.dependenciesTreeView.reveal(dependenciesTreeNode, { focus: true });
        this.onSelectNode(dependenciesTreeNode);
    }

    /**
     * Focus on dependency after a click on a dependency in the components tree.
     * @param dependenciesTreeNode - The chosen dependency.
     */
    private doFocus(dependenciesTreeNode: DependenciesTreeNode) {
        this.onSelectNode(dependenciesTreeNode);
    }

    /**
     * Show JFrog Output tab.
     */
    private showOutput() {
        this._logManager.showOutput();
    }

    /**
     * Refresh the components tree.
     * @param quickScan - True to allow reading from scan cache.
     */
    private doRefresh(quickScan: boolean = false) {
        this._treesManager.dependenciesTreeDataProvider.refresh(quickScan);
    }

    /**
     * Connect to Xray server. If connection success, perform a quick scan.
     */
    private async doConnect() {
        let credentialsSet: boolean = await this._connectionManager.connect();
        if (credentialsSet) {
            this.doRefresh(true);
        }
    }

    /**
     * Disconnect from Xray server. Delete the URL, username & password from FS.
     */
    private async doDisconnect() {
        if (await this._connectionManager.disconnect()) {
            this.doRefresh(true);
        }
    }

    /**
     * Show the filter menu.
     */
    private doFilter() {
        this._filterManager.showFilterMenu();
    }

    /**
     * Register a command in the vscode platform.
     * @param command - The command to register.
     * @param callback - The function to execute.
     */
    private registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => void) {
        context.subscriptions.push(vscode.commands.registerCommand(command, callback));
    }

    /**
     * Populate component details and component issues details with information about dependenciesTreeNode.
     * @param dependenciesTreeNode - The selected node in the components tree.
     */
    private onSelectNode(dependenciesTreeNode: DependenciesTreeNode) {
        this._treesManager.componentDetailsDataProvider.selectNode(dependenciesTreeNode);
        this._treesManager.issuesDataProvider.selectNode(dependenciesTreeNode);
    }
}
