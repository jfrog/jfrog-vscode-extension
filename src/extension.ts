import * as vscode from 'vscode';
import { CodeLensManager } from './main/codeLens/codeLensManager';
import { CommandManager } from './main/commands/commandManager';
import { ConnectionManager } from './main/connect/connectionManager';
import { DiagnosticsManager } from './main/diagnostics/diagnosticsManager';
import { FilterManager } from './main/filter/filterManager';
import { FocusManager } from './main/focus/focusManager';
import { ExclusionsManager } from './main/exclusions/exclusionsManager';
import { HoverManager } from './main/hover/hoverManager';
import { ScanCacheManager } from './main/cache/scanCacheManager';
import { TreesManager } from './main/treeDataProviders/treesManager';
import { WatcherManager } from './main/watchers/watcherManager';
import { LogManager } from './main/log/logManager';
import { DependencyUpdateManager } from './main/dependencyUpdate/dependencyUpdateManager';
import { BuildsManager } from './main/builds/buildsManager';
import { ScanLogicManager } from './main/scanLogic/scanLogicManager';
import { ExportManager } from './main/export/exportManager';
import { ScanManager } from './main/scanLogic/scanManager';
import { IssuesFilterManager } from './main/filter/issuesFilterManager';
import { CacheManager } from './main/cache/cacheManager';
import { vulnerabilityDetails } from './main/webviews/vulnerabilityDetails';

/**
 * This method is called when the extension is activated.
 * @param context - The extension context
 */
export async function activate(context: vscode.ExtensionContext) {
    let workspaceFolders: vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders?.map(el => el) || [];

    let logManager: LogManager = new LogManager().activate();
    let connectionManager: ConnectionManager = await new ConnectionManager(logManager).activate(context);

    let scanManager: ScanManager = new ScanManager(connectionManager, logManager).activate();
    let cacheManager: CacheManager = new CacheManager(workspaceFolders, logManager).activate(context);
    cacheManager.activate(context);

    let scanCacheManager: ScanCacheManager = new ScanCacheManager().activate(context);
    let scanLogicManager: ScanLogicManager = new ScanLogicManager(connectionManager, scanCacheManager, logManager).activate();
    let treesManager: TreesManager = await new TreesManager(
        workspaceFolders,
        connectionManager,
        scanCacheManager,
        scanLogicManager,
        logManager,
        scanManager,
        cacheManager
    ).activate(context);

    let issueFilterManager: IssuesFilterManager = new IssuesFilterManager(/*treesManager*/).activate();

    let filterManager: FilterManager = new FilterManager(treesManager).activate();
    let focusManager: FocusManager = new FocusManager().activate();
    let exclusionManager: ExclusionsManager = new ExclusionsManager(treesManager).activate();
    let dependencyUpdateManager: DependencyUpdateManager = new DependencyUpdateManager(scanCacheManager).activate();
    let buildsManager: BuildsManager = new BuildsManager(treesManager).activate();
    let exportManager: ExportManager = new ExportManager(workspaceFolders, treesManager).activate();

    new vulnerabilityDetails().activate(context);
    new DiagnosticsManager(treesManager).activate(context);
    new WatcherManager(treesManager).activate(context);
    new HoverManager(treesManager).activate(context);
    new CodeLensManager().activate(context);

    new CommandManager(
        logManager,
        connectionManager,
        treesManager,
        filterManager,
        focusManager,
        exclusionManager,
        dependencyUpdateManager,
        buildsManager,
        exportManager,
        issueFilterManager
    ).activate(context);
}
