import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { ScanCacheManager } from '../../scanCache/scanCacheManager';
import { GoUtils } from '../../utils/goUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { PypiUtils } from '../../utils/pypiUtils';
import { DependenciesTreeNode } from './dependenciesTreeNode';

export class DependenciesTreesFactory {
    public static async createDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Collections.Set<ComponentDetails>,
        scanCacheManager: ScanCacheManager,
        dependenciesTree: DependenciesTreeNode,
        quickScan: boolean
    ) {
        await NpmUtils.createDependenciesTrees(workspaceFolders, progress, componentsToScan, scanCacheManager, dependenciesTree, quickScan);
        await PypiUtils.createDependenciesTrees(workspaceFolders, progress, componentsToScan, scanCacheManager, dependenciesTree, quickScan);
        await GoUtils.createDependenciesTrees(workspaceFolders, progress, componentsToScan, scanCacheManager, dependenciesTree, quickScan);
    }
}
