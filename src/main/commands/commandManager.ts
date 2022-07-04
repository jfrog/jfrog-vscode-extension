import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { DependencyUpdateManager } from '../dependencyUpdate/dependencyUpdateManager';
import { ExclusionsManager } from '../exclusions/exclusionsManager';
import { ExtensionComponent } from '../extensionComponent';
import { FilterManager } from '../filter/filterManager';
import { FocusType } from '../focus/abstractFocus';
import { FocusManager } from '../focus/focusManager';
import { LogManager } from '../log/logManager';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { State, TreesManager } from '../treeDataProviders/treesManager';
import { TreeDataHolder } from '../treeDataProviders/utils/treeDataHolder';
import { ScanUtils } from '../utils/scanUtils';
import { BuildsManager } from '../builds/buildsManager';
import { Configuration } from '../utils/configuration';
import { ExportManager } from '../export/exportManager';
import { SourceCodeCveTreeNode } from '../treeDataProviders/sourceCodeTree/sourceCodeCveNode';
import { VulnerabilityNode } from '../treeDataProviders/issuesDataProvider';

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
        private _buildsManager: BuildsManager,
        private _exportManager: ExportManager
    ) {}

    public activate(context: vscode.ExtensionContext) {
        this.registerCommand(context, 'jfrog.source.code.scan.jumpToSource', (sourceCodeTreeNode, index) =>
            this.jumpToSource(sourceCodeTreeNode, index)
        );
        this.registerCommand(context, 'jfrog.source.code.scan.showInSourceCodeTree', sourceCodeTreeNode =>
            this.showInSourceCodeTree(sourceCodeTreeNode)
        );
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
        this.registerCommand(context, 'jfrog.source.code.scan.refresh', () => this.doCodeScanRefresh());
        this.registerCommand(context, 'jfrog.xray.connect', () => this.doConnect());
        this.registerCommand(context, 'jfrog.xray.filter', () => this.doFilter());
        this.registerCommand(context, 'jfrog.xray.local', () => this.doLocal());
        this.registerCommand(context, 'jfrog.xray.ci', () => this.doCi());
        this.registerCommand(context, 'jfrog.xray.builds', () => this.doBuildSelected());
        this.registerCommand(context, 'jfrog.xray.export', () => this.doExport());
        this.updateLocalCiIcons();
    }

    public doLocal() {
        this._treesManager.state = State.Local;
        this.updateLocalCiIcons();
        this._treesManager.treeDataProviderManager.stateChange();
    }

    public doCi() {
        if (!this.areCiPreconditionsMet()) {
            return;
        }
        this._treesManager.state = State.CI;
        this.updateLocalCiIcons();
        this._treesManager.treeDataProviderManager.stateChange();
    }

    private areCiPreconditionsMet() {
        if (!this._treesManager.connectionManager.areCompleteCredentialsSet()) {
            vscode.window
                .showErrorMessage(
                    'CI integration disabled - Artifactory server is not configured. ' +
                        'To use this section of the JFrog extension, please configure your JFrog platform details.',
                    ...['Configure JFrog Details']
                )
                .then(async action => {
                    if (action) {
                        await this.doConnect();
                    }
                });
            return false;
        }
        if (!Configuration.getBuildsPattern()) {
            vscode.window.showErrorMessage('CI integration disabled - build name pattern is not set.', ...['Set Build Name Pattern']).then(action => {
                if (action) {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'jfrog.xray.ciIntegration.buildNamePattern');
                }
            });
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
     * Reveal the file and a specific line number that a CVE is found by the CVE applicability scan.
     * This functionality is included in:
     * 1. Click on the 'eye' button
     * 2. Click on the actual CVE in the CVE applicability view
     * 3. Click on the reference/ actual CVE in the CVE applicability view
     * 4. Click on the cve node in the dependency detail view
     * @param node - CVE node
     * @param index - index to jump in the CVE Node.
     */
    private jumpToSource(node: SourceCodeCveTreeNode | VulnerabilityNode | TreeDataHolder, index: number) {
        if (node instanceof VulnerabilityNode) {
            return this._focusManager.focusOnCve(node.sourceCodeCveTreeNode);
        }
        if (node instanceof TreeDataHolder) {
            return this._focusManager.focusOnCve(node.command?.arguments?.[0], node.command?.arguments?.[1]);
        }
        return this._focusManager.focusOnCve(node, index);
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
                this._treesManager.logManager.logMessage((<any>error).message, 'ERR', true);
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
     * Shows a specific node in the source code tree after clicking on the bulb icon in the source code.
     * @param sourceCodeCveTreeNode
     */
    private showInSourceCodeTree(sourceCodeCveTreeNode: SourceCodeCveTreeNode) {
        this._treesManager.sourceCodeTreeView.reveal(sourceCodeCveTreeNode, { focus: true, select: true, expand: true });
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

    private async doCodeScanRefresh(quickScan: boolean = false) {
        await vscode.window.withProgress(
            <vscode.ProgressOptions>{
                // Start progress in balloon only if the user initiated a full scan by clicking on the "Refresh" button.
                // Otherwise - show the progress in the status bar.
                location: quickScan ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification,
                title: 'Code vulnerability scanning',
                cancellable: true
            },
            async (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => {
                progress.report({ message: '📝 Code vulnerability scanning' });
                token.onCancellationRequested(() => {
                    console.log('Canceled CVE Applicability scan');
                });
                await this._treesManager.sourceCodeTreeDataProvider.update();
                await this._treesManager.sourceCodeTreeDataProvider.refresh();
            }
        );
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
        this._treesManager.dependencyDetailsProvider.selectNode(dependenciesTreeNode);
    }

    /**
     * Export vulnerabilities/violations to an external file.
     */
    private doExport() {
        this._exportManager.showExportMenu();
    }
}
