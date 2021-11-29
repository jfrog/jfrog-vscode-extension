import { ComponentDetails, IUsageFeature } from 'jfrog-client-js';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../connect/connectionManager';
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

        await this.sendUsageReport(projectDescriptors, treesManager.connectionManager);
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

    /**
     * Sends usage report for all techs we found project descriptors of.
     * @param projectDescriptors - map of all project descriptors by their tech.
     * @param connectionManager - manager containing Artifactory details if configured.
     */
    private static async sendUsageReport(projectDescriptors: Map<PackageDescriptorType, vscode.Uri[]>, connectionManager: ConnectionManager) {
        let featureArray: IUsageFeature[] = [];
        for (const [techEnum, descriptors] of projectDescriptors.entries()) {
            // Only add to usage if found descriptors for tech.
            if (!!descriptors) {
                const featureName: string = PackageDescriptorType[techEnum].toLowerCase() + '-deps';
                featureArray.push({ featureId: featureName });
            }
        }
        await connectionManager.sendUsageReport(featureArray);
    }
}
