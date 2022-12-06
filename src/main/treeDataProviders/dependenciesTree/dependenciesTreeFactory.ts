import { IUsageFeature } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../connect/connectionManager';
import { ProjectDetails } from '../../types/projectDetails';
import { PackageType } from '../../types/projectType';
import { GoUtils } from '../../utils/goUtils';
import { MavenUtils } from '../../utils/mavenUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { NugetUtils } from '../../utils/nugetUtils';
import { PypiUtils } from '../../utils/pypiUtils';
// import { ScanUtils } from '../../utils/scanUtils';
import { YarnUtils } from '../../utils/yarnUtils';
import { TreesManager } from '../treesManager';
import { DependenciesTreeNode } from './dependenciesTreeNode';

export class DependenciesTreesFactory {
    public static async createDependenciesTrees(
        projectDescriptors: Map<PackageType, vscode.Uri[]>,
        workspaceFolders: vscode.WorkspaceFolder[],
        componentsToScan: ProjectDetails[],
        treesManager: TreesManager,
        parent: DependenciesTreeNode,
        quickScan: boolean
    ) {
        if (!treesManager.connectionManager.areXrayCredentialsSet()) {
            return;
        }

        this.sendUsageReport(projectDescriptors, treesManager.connectionManager);
        await GoUtils.createDependenciesTrees(projectDescriptors.get(PackageType.GO), componentsToScan, treesManager, parent, quickScan);
        await NpmUtils.createDependenciesTrees(projectDescriptors.get(PackageType.NPM), componentsToScan, treesManager, parent, quickScan);
        await YarnUtils.createDependenciesTrees(projectDescriptors.get(PackageType.YARN), componentsToScan, treesManager, parent, quickScan);
        await PypiUtils.createDependenciesTrees(
            projectDescriptors.get(PackageType.PYTHON),
            workspaceFolders,
            componentsToScan,
            treesManager,
            parent,
            quickScan
        );
        await MavenUtils.createDependenciesTrees(projectDescriptors.get(PackageType.MAVEN), componentsToScan, treesManager, parent, quickScan);
        await NugetUtils.createDependenciesTrees(projectDescriptors.get(PackageType.NUGET), componentsToScan, treesManager, parent, quickScan);
    }

    /**
     * Sends usage report for all techs we found project descriptors of.
     * @param projectDescriptors - map of all project descriptors by their tech.
     * @param connectionManager - manager containing Artifactory details if configured.
     */
    private static async sendUsageReport(projectDescriptors: Map<PackageType, vscode.Uri[]>, connectionManager: ConnectionManager) {
        let featureArray: IUsageFeature[] = [];
        for (const [techEnum, descriptors] of projectDescriptors.entries()) {
            // Only add to usage if found descriptors for tech.
            if (!!descriptors) {
                const featureName: string = PackageType[techEnum].toLowerCase() + '-deps';
                featureArray.push({ featureId: featureName });
            }
        }
        await connectionManager.sendUsageReport(featureArray);
    }
}
