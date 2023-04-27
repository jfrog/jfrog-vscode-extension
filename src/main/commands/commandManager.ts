import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ExtensionComponent } from '../extensionComponent';
import { FilterManager } from '../filter/filterManager';
import { LogManager } from '../log/logManager';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { State, TreesManager } from '../treeDataProviders/treesManager';
import { TreeDataHolder } from '../treeDataProviders/utils/treeDataHolder';
import { BuildsManager } from '../builds/buildsManager';
import { Configuration } from '../utils/configuration';
import { ContextKeys, ExtensionMode } from '../constants/contextKeys';
import { ScanUtils } from '../utils/scanUtils';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager';
import { IDependencyPage, IEosPage, IIaCPage, ISecretsPage } from 'jfrog-ide-webview';
import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DependencyUpdateManager } from '../dependencyUpdate/dependencyUpdateManager';
import { Utils } from '../utils/utils';

/**
 * Register and execute all commands in the extension.
 */
export class CommandManager implements ExtensionComponent {
    constructor(
        private _logManager: LogManager,
        private _connectionManager: ConnectionManager,
        private _treesManager: TreesManager,
        private _filterManager: FilterManager,
        private _buildsManager: BuildsManager,
        private _diagnosticManager: DiagnosticsManager,
        private _DependencyUpdateManager: DependencyUpdateManager
    ) {}

    public activate(context: vscode.ExtensionContext) {
        // Connection
        this.registerCommand(context, 'jfrog.xray.disconnect', () => this.doDisconnect(true));
        this.registerCommand(context, 'jfrog.xray.resetConnection', () => this.doDisconnect(false));
        this.registerCommand(context, 'jfrog.show.connectionStatus', () => this.showConnectionStatus());
        this.registerCommand(context, 'jfrog.xray.connect', () => this.doConnect(true));
        this.registerCommand(context, 'jfrog.xray.reConnect', () => this.doReconnect());
        // General
        this.registerCommand(context, 'jfrog.open.settings', () => Utils.openSettings());
        this.registerCommand(context, 'jfrog.xray.copyToClipboard', node => this.doCopyToClipboard(node));
        this.registerCommand(context, 'jfrog.xray.showOutput', () => this.showOutput());
        this.registerCommand(context, 'jfrog.xray.refresh', () => this.doRefresh());
        this.registerCommand(context, 'jfrog.xray.update.dependency', () => this.doRefresh());
        // Local state
        this.registerCommand(context, 'jfrog.issues.open.ignore', issue => vscode.env.openExternal(vscode.Uri.parse(issue.ignoreUrl)));
        this.registerCommand(context, 'jfrog.issues.file.open', file => ScanUtils.openFile(file));
        this.registerCommand(context, 'jfrog.issues.file.open.location', (file, fileRegion) => ScanUtils.openFile(file, fileRegion));
        this.registerCommand(context, 'jfrog.issues.select.node', item => this._treesManager.selectItemOnIssuesTree(item));
        this.registerCommand(context, 'jfrog.issues.select.updateDependency', (dependency: DependencyIssuesTreeNode, version: string) =>
            this.fixDependencyIssue(dependency, version)
        );
        this.registerCommand(context, 'jfrog.issues.file.open.details', (file, fileRegion, details) =>
            this.doOpenFileAndDetailsPage(file, fileRegion, details)
        );
        this.registerCommand(context, 'jfrog.xray.ci', () => this.doCi());
        // CI state
        this.registerCommand(context, 'jfrog.xray.focus', dependenciesTreeNode => this.doFocus(dependenciesTreeNode));
        this.registerCommand(context, 'jfrog.xray.filter', () => this.doFilter());
        this.registerCommand(context, 'jfrog.xray.local', () => this.doLocal());
        this.registerCommand(context, 'jfrog.xray.builds', () => this.doBuildSelected());

        this.updateLocalCiIcons();
    }

    public doLocal() {
        this._treesManager.state = State.Local;
        this.updateLocalCiIcons();
    }

    public doCi() {
        if (!this.areCiPreconditionsMet()) {
            return;
        }
        this._treesManager.state = State.CI;
        this.updateLocalCiIcons();
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
                        await this.doConnect(true);
                    }
                });
            return false;
        }
        if (!Configuration.getBuildsPattern()) {
            vscode.window.showErrorMessage('CI integration disabled - build name pattern is not set.', ...['Set Build Name Pattern']).then(action => {
                if (action) {
                    Utils.openSettings('jfrog.xray.ciIntegration.buildNamePattern');
                }
            });
            return false;
        }
        return true;
    }

    private updateLocalCiIcons() {
        vscode.commands.executeCommand(ContextKeys.SET_CONTEXT, ExtensionMode.Local, this._treesManager.isLocalState());
        vscode.commands.executeCommand(ContextKeys.SET_CONTEXT, ExtensionMode.Ci, this._treesManager.isCiState());
    }

    /**
     * Copy the node content to clipboard.
     * @param node The tree node. Can be instance of DependenciesTreeNode or TreeDataHolder.
     */
    private doCopyToClipboard(node: vscode.TreeItem) {
        let text: string | vscode.TreeItemLabel | undefined;
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
            vscode.env.clipboard.writeText(text?.toString());
        }
    }

    /**
     * Update a dependency in the project descriptor (e.g. package.json) to a new version.
     */
    private async fixDependencyIssue(dependency: DependencyIssuesTreeNode, version: string) {
        let updated: boolean = false;
        await ScanUtils.scanWithProgress(async (): Promise<void> => {
            updated = await this._DependencyUpdateManager.updateToFixedVersion(dependency, version);
            if (updated) {
                this._logManager.logMessageAndToastInfo(`'Successfully updated the dependency ${dependency.name} to version ${version}.`, 'INFO');
            } else {
                this._logManager.logMessageAndToastInfo('Update dependency version was canceled.', 'INFO');
            }
        }, 'Updating ' + dependency.name);
        if (updated && (await this.askRescan('Scan your project to reflect the changes?'))) {
            this.doRefresh(true);
        }
    }

    /**
     * Show JFrog Output tab.
     */
    private showOutput() {
        this._logManager.showOutput();
    }

    /**
     * Refresh the components tree and updates the currently open files with diagnostics
     * @param scan - True to scan the workspace, false will load from cache
     */
    private async doRefresh(scan: boolean = true) {
        this._diagnosticManager.clearDiagnostics();
        await this._treesManager.refresh(scan);
        this._diagnosticManager.updateDiagnostics();
    }

    /**
     * Open webpage with the given data
     * @param page - data to show in webpage
     */
    public doShowDetailsPage(page: IDependencyPage | IEosPage | IIaCPage | ISecretsPage) {
        vscode.commands.executeCommand('jfrog.view.details.page', page);
    }

    /**
     * Open a file with selected range and the webpage with the given data
     * @param filePath - file to open in editor
     * @param fileRegion - range inside the file to select
     * @param page - the data to show in the open page
     */
    public async doOpenFileAndDetailsPage(filePath: string, fileRegion: vscode.Range, page: IDependencyPage | IEosPage | IIaCPage | ISecretsPage) {
        ScanUtils.openFile(filePath, fileRegion).then(() => this.doShowDetailsPage(page));
    }

    /**
     * Connect to JFrog Platform server. If the connection success, perform a quick scan.
     * @param chooseMethod if true, a quick pick UI is shown, to choose the connection method. If false, all the connection methods are attempted.
     */
    private async doConnect(chooseMethod: boolean = false) {
        let credentialsSet: boolean = await this._connectionManager.connect(chooseMethod);
        if (credentialsSet) {
            await this.doRefresh(false);
        }
    }

    /**
     * Reconnect to an existing JFrog Platform credentials.
     */
    private async doReconnect() {
        let ok: boolean = (await this._connectionManager.populateCredentials(false)) && (await this._connectionManager.verifyCredentials(false));
        if (ok) {
            await this.doConnect();
            vscode.window.showInformationMessage('✨ Successfully reconnected ✨');
            return;
        }
        vscode.window.showErrorMessage("Couldn't connect to: " + this._connectionManager.xrayUrl);
    }

    /**
     * Disconnect from JFrog Platform server. Delete the URL, username & password from FS.
     * @param question prompts a yes/no question before perform disconnect
     */
    private async doDisconnect(question: boolean) {
        if (question) {
            const answer: boolean = await this.askYesNo(
                'Are you sure you want to disconnect from the JFrog Platform (' +
                    (this._connectionManager.url || this._connectionManager.xrayUrl) +
                    ') ?'
            );
            if (!answer) {
                return;
            }
        }
        if (await this._connectionManager.disconnect()) {
            await this.doRefresh(true);
        }
    }

    private async askYesNo(message: string): Promise<boolean> {
        return (await vscode.window.showInformationMessage(message, 'Yes', 'No')) === 'Yes';
    }

    private async askRescan(message: string): Promise<boolean> {
        return (await vscode.window.showInformationMessage(message, 'Rescan project')) === 'Rescan project';
    }

    private async showConnectionStatus() {
        if (await this._connectionManager.isSignedIn()) {
            vscode.window.showInformationMessage(this.xrayConnectionDetails());
            if (this._connectionManager.rtUrl) {
                return vscode.window.showInformationMessage(this.artifactoryConnectionDetails());
            }
            return;
        }
        if (await this._connectionManager.isConnectionLost()) {
            vscode.window.showWarningMessage("Couldn't connect to your JFrog Platform.");
            return;
        }
        return vscode.window.showErrorMessage('No connection to JFrog Platform');
    }

    private xrayConnectionDetails(): string {
        return this.createServerDetailsMessage('Xray', this._connectionManager.xrayUrl, this._connectionManager.xrayVersion);
    }

    private artifactoryConnectionDetails(): string {
        return this.createServerDetailsMessage('Artifactory', this._connectionManager.rtUrl, this._connectionManager.artifactoryVersion);
    }

    private createServerDetailsMessage(name: string, url: string, version?: string): string {
        return `${name} ${url} ${version ? `v${version}` : ''}`;
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
     * Focus on dependency after a click on a dependency in the components tree.
     * @param dependenciesTreeNode - The chosen dependency.
     */
    private doFocus(dependenciesTreeNode: DependenciesTreeNode) {
        this.onSelectNode(dependenciesTreeNode);
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
     * Populate component details and component issues details with information about dependenciesTreeNode.
     * @param dependenciesTreeNode - The selected node in the components tree.
     */
    private onSelectNode(dependenciesTreeNode: DependenciesTreeNode) {
        this._treesManager.dependencyDetailsProvider.selectNode(dependenciesTreeNode);
    }
}
