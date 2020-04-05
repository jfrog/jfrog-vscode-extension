import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { GoUtils } from '../../utils/goUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { PypiUtils } from '../../utils/pypiUtils';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { TreesManager } from '../treesManager';
import { MavenUtils } from '../../utils/mavenUtils';

export class DependenciesTreesFactory {
    public static async createDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        componentsToScan: Collections.Set<ComponentDetails>,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ) {
        await NpmUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
        await PypiUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
        await GoUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
        await MavenUtils.createMavenDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
    }
}
