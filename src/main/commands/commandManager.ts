import * as vscode from 'vscode';
import {ConnectionManager} from '../connect/connectionManager';
import {DependencyUpdateManager} from '../dependencyUpdate/dependencyUpdateManager';
import {ExclusionsManager} from '../exclusions/exclusionsManager';
import {ExtensionComponent} from '../extensionComponent';
import {FilterManager} from '../filter/filterManager';
import {FocusType} from '../focus/abstractFocus';
import {FocusManager} from '../focus/focusManager';
import {LogManager} from '../log/logManager';
import {DependenciesTreeNode} from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import {State, TreesManager} from '../treeDataProviders/treesManager';
import {TreeDataHolder} from '../treeDataProviders/utils/treeDataHolder';
import {ScanUtils} from '../utils/scanUtils';
import {BuildsManager} from "../builds/buildsManager";
import {Configuration} from "../utils/configuration";

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
        private _exclusionManager: ExclusionsManager,
        private _DependencyUpdateManager: DependencyUpdateManager,
        private _buildsManager: BuildsManager
    ) {}

    public activate(context: vscode.ExtensionContext) {
        this.registerCommand(context, 'jfrog.xray.showInProjectDesc', dependenciesTreeNode => this.doShowInProjectDesc(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.excludeDependency', dependenciesTreeNode => this.doExcludeDependency(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.updateDependency', dependenciesTreeNode => this.doUpdateDependencyVersion(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.codeAction', dependenciesTreeNode => this.doCodeAction(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.focus', dependenciesTreeNode => this.doFocus(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.copyToClipboard', node => this.doCopyToClipboard(node));
        this.registerCommand(context, 'jfrog.xray.openLink', url => this.doOpenLink(url));
        this.registerCommand(context, 'jfrog.xray.disconnect', () => this.doDisconnect());
        this.registerCommand(context, 'jfrog.xray.showOutput', () => this.showOutput());
        this.registerCommand(context, 'jfrog.xray.refresh', () => this.doRefresh());
        this.registerCommand(context, 'jfrog.xray.connect', () => this.doConnect());
        this.registerCommand(context, 'jfrog.xray.filter', () => this.doFilter());
        this.registerCommand(context, 'jfrog.xray.local', () => this.doLocal());
        this.registerCommand(context, 'jfrog.xray.ci', () => this.doCi());
        this.registerCommand(context, 'jfrog.xray.builds', () => this.doBuildSelected());
        this.updateLocalCiIcons();
    }

    public doLocal() {
        this._treesManager.state = State.Local;
        this.updateLocalCiIcons();
        this._treesManager.treeDataProviderManager.stateChange();
    }

    public doCi() {
        if(!this.areCiPreconditionsMet()) {
            return;
        }
        this._treesManager.state = State.CI;
        this.updateLocalCiIcons();
        this._treesManager.treeDataProviderManager.stateChange();
    }

    private areCiPreconditionsMet() {
        if (!this._treesManager.connectionManager.areAllCredentialsSet()) {
            this._treesManager.logManager.logMessage('CI integration disabled - Artifactory server is not configured.', 'INFO');
            return false;
        }
        if (!Configuration.getBuildsPattern()) {
            this._treesManager.logManager.logMessage('CI integration disabled - build name pattern is not set. ' +
                'Configure it under the JFrog CI Integration page in the configuration.', 'INFO');
            return false;
        }
        return true;
    }

    private updateLocalCiIcons() {
        vscode.commands.executeCommand('setContext', 'isLocal', this._treesManager.isLocalState());
        vscode.commands.executeCommand('setContext', 'isCi', this._treesManager.isCiState());
    }

    /**
     * Show the dependency in the project descriptor (e.g. package.json) file after right click on the components tree and a left click on "Show in project descriptor".
     * @param dependenciesTreeNode - The dependency to show.
     */
    private doShowInProjectDesc(dependenciesTreeNode: DependenciesTreeNode) {
        this._focusManager.focusOnDependency(dependenciesTreeNode, FocusType.Dependency);
        this.onSelectNode(dependenciesTreeNode);
    }

    /**
     * Exclude dependency in the project descriptor (e.g. package.json).
     * @param dependenciesTreeNode - The dependency to exclude
     */
    private doExcludeDependency(dependenciesTreeNode: DependenciesTreeNode) {
        this._exclusionManager.excludeDependency(dependenciesTreeNode);
    }

    /**
     * Update a dependency in the project descriptor (e.g. package.json) to a new version.
     * @param dependenciesTreeNode - The dependency to update
     */
    private async doUpdateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode) {
        await ScanUtils.scanWithProgress(async (): Promise<void> => {
            try {
                if (!(await this._DependencyUpdateManager.updateDependencyVersion(dependenciesTreeNode))) {
                    return;
                }
                this._focusManager.focusOnDependency(dependenciesTreeNode, FocusType.DependencyVersion);
                this._treesManager.treeDataProviderManager.removeNode(dependenciesTreeNode);
            } catch (error) {
                vscode.window.showErrorMessage('Could not update dependency version.', <vscode.MessageOptions>{ modal: false });
                this._treesManager.logManager.logMessage(error.stdout.toString(), 'ERR', true);
            }
        }, 'Updating ' + dependenciesTreeNode.generalInfo.getComponentId());
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
     * Copy the node content to clipboard.
     * @param node The tree node. Can be instance of DependenciesTreeNode or TreeDataHolder.
     */
    private doCopyToClipboard(node: vscode.TreeItem) {
        let text: string | undefined;
        if (node instanceof TreeDataHolder) {
            // 'Component Details' or leaf of 'Component Issue Details'
            let treeDataHolder: TreeDataHolder = node;
            if (treeDataHolder.value) {
                text = node.value;
            } else if (treeDataHolder.key) {
                // License
                text = node.key;
            }
        } else if (node.description) {
            // 'Component Tree' with version
            text = node.label + ':' + node.description;
        } else if (node.label) {
            // 'Component Tree' without version or 'Component Issue Details' root node
            text = node.label;
        }
        if (text) {
            vscode.env.clipboard.writeText(text);
        }
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
       this._treesManager.treeDataProviderManager.refresh(quickScan);
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
     * Show the builds menu.
     */
    private doBuildSelected() {
        this._buildsManager.showBuildsMenu();
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
