import * as vscode from 'vscode';
import { CodeLensManager } from './main/codeLens/codeLensManager';
import { CommandManager } from './main/commands/commandManager';
import { ConnectionManager } from './main/connect/connectionManager';
import { DiagnosticsManager } from './main/diagnostics/diagnosticsManager';
import { FilterManager } from './main/filter/filterManager';
import { ScanCacheManager } from './main/cache/scanCacheManager';
import { TreesManager } from './main/treeDataProviders/treesManager';
import { LogManager } from './main/log/logManager';
import { BuildsManager } from './main/builds/buildsManager';
import { ScanManager } from './main/scanLogic/scanManager';
import { CacheManager } from './main/cache/cacheManager';
import { WebView } from './main/webview/webview';
import { DependencyUpdateManager } from './main/dependencyUpdate/dependencyUpdateManager';

/**
 * This method is called when the extension is activated.
 * @param context - The extension context
 */
export async function activate(context: vscode.ExtensionContext) {
    const workspaceFolders: vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders?.map(el => el) || [];
    const logManager: LogManager = new LogManager().activate();
    const cacheManager: CacheManager = new CacheManager(logManager).activate(context);
    const connectionManager: ConnectionManager = await new ConnectionManager(logManager).activate(context);
    const scanManager: ScanManager = new ScanManager(connectionManager, logManager).activate();
    const scanCacheManager: ScanCacheManager = new ScanCacheManager().activate(context);
    const treesManager: TreesManager = await new TreesManager(
        workspaceFolders,
        connectionManager,
        scanCacheManager,
        scanManager,
        cacheManager,
        logManager
    ).activate(context);

    const filterManager: FilterManager = new FilterManager(treesManager, scanCacheManager).activate();
    const buildsManager: BuildsManager = new BuildsManager(treesManager).activate();
    const dependencyUpdateManager: DependencyUpdateManager = new DependencyUpdateManager(logManager).activate();
    const diagnosticManager: DiagnosticsManager = new DiagnosticsManager(treesManager, dependencyUpdateManager).activate(context);
    new WebView(logManager).activate(context);

    new CodeLensManager().activate(context);
    new CommandManager(
        logManager,
        connectionManager,
        treesManager,
        filterManager,
        buildsManager,
        diagnosticManager,
        dependencyUpdateManager
    ).activate(context);
}
