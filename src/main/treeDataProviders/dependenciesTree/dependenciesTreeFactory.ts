import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { GoUtils } from '../../utils/goUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { PypiUtils } from '../../utils/pypiUtils';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { TreesManager } from '../treesManager';
import { MavenUtils } from '../../utils/mavenUtils';
import { NugetUtils } from '../../utils/nugetUtils';

export class DependenciesTreesFactory {
    public static async createDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        componentsToScan: Collections.Set<ComponentDetails>,
        goCenterComponentsToScan: Collections.Set<ComponentDetails>,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ) {
        await GoUtils.createDependenciesTrees(workspaceFolders, componentsToScan, goCenterComponentsToScan, treesManager, parent, quickScan);
        if (treesManager.connectionManager.areCredentialsSet()) {
            await NpmUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
            await PypiUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
            await MavenUtils.createMavenDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
            await NugetUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, quickScan);
        }
    }
}
