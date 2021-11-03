import { ComponentDetails } from 'jfrog-client-js';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { GoUtils } from '../../utils/goUtils';
import { MavenUtils } from '../../utils/mavenUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { NugetUtils } from '../../utils/nugetUtils';
import { PypiUtils } from '../../utils/pypiUtils';
import { PackageDescriptorType, ScanUtils } from '../../utils/scanUtils';
import { TreesManager } from '../treesManager';
import { DependenciesTreeNode } from './dependenciesTreeNode';

export class DependenciesTreesFactory {
    public static async createDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        componentsToScan: Collections.Set<ComponentDetails>,
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ) {
        if (!treesManager.connectionManager.areXrayCredentialsSet()) {
            return;
        }
        let projectDescriptors: Map<PackageDescriptorType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
            workspaceFolders,
            treesManager.logManager
        );
        await GoUtils.createDependenciesTrees(projectDescriptors.get(PackageDescriptorType.GO), componentsToScan, treesManager, parent, quickScan);
        await NpmUtils.createDependenciesTrees(projectDescriptors.get(PackageDescriptorType.NPM), componentsToScan, treesManager, parent, quickScan);
        await PypiUtils.createDependenciesTrees(
            projectDescriptors.get(PackageDescriptorType.PYTHON),
            workspaceFolders,
            componentsToScan,
            treesManager,
            parent,
            quickScan
        );
        await MavenUtils.createDependenciesTrees(
            projectDescriptors.get(PackageDescriptorType.MAVEN),
            componentsToScan,
            treesManager,
            parent,
            quickScan
        );
        await NugetUtils.createDependenciesTrees(
            projectDescriptors.get(PackageDescriptorType.NUGET),
            componentsToScan,
            treesManager,
            parent,
            quickScan
        );
    }
}
