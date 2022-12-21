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
import { DetailsWebView } from './main/webviews/detailsWebView';

/**
 * This method is called when the extension is activated.
 * @param context - The extension context
 */
export async function activate(context: vscode.ExtensionContext) {
    let workspaceFolders: vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders?.map(el => el) || [];
    let logManager: LogManager = new LogManager().activate();
    let connectionManager: ConnectionManager = await new ConnectionManager(logManager).activate(context);
    let scanManager: ScanManager = new ScanManager(connectionManager, logManager).activate();
    let cacheManager: CacheManager = new CacheManager().activate(context);

    let scanCacheManager: ScanCacheManager = new ScanCacheManager().activate(context); // TODO: remove when refactoring builds.
    let treesManager: TreesManager = await new TreesManager(
        workspaceFolders,
        connectionManager,
        scanCacheManager,
        scanManager,
        cacheManager,
        logManager
    ).activate(context);

    let filterManager: FilterManager = new FilterManager(treesManager, scanCacheManager).activate();
    let buildsManager: BuildsManager = new BuildsManager(treesManager).activate();

    new DetailsWebView().activate(context);
    new DiagnosticsManager(treesManager).activate(context);
    new CodeLensManager().activate(context);

    new CommandManager(logManager, connectionManager, treesManager, filterManager, buildsManager).activate(context);
}
