import { IUsageFeature } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../connect/connectionManager';
import { GeneralInfo } from '../../types/generalInfo';
import { ProjectDetails } from '../../types/projectDetails';
import { getNumberOfSupportedPackageTypes, PackageType } from '../../types/projectType';
import { GoUtils } from '../../utils/goUtils';
import { MavenUtils } from '../../utils/mavenUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { NugetUtils } from '../../utils/nugetUtils';
import { PypiUtils } from '../../utils/pypiUtils';
import { YarnUtils } from '../../utils/yarnUtils';
import { TreesManager } from '../treesManager';
import { StepProgress } from '../utils/stepProgress';
import { DependenciesTreeNode } from './dependenciesTreeNode';

export class DependenciesTreesFactory {
    public static async createDependenciesTrees(
        projectDescriptors: Map<PackageType, vscode.Uri[]>,
        workspaceFolder: vscode.WorkspaceFolder,
        componentsToScan: ProjectDetails[],
        treesManager: TreesManager,
        progressManager: StepProgress,
        checkCanceled: () => void,
        parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', PackageType.Unknown))
    ): Promise<DependenciesTreeNode> {
        if (!treesManager.connectionManager.areXrayCredentialsSet()) {
            return parent;
        }

        this.sendUsageReport(projectDescriptors, treesManager.connectionManager);
        let typesDone: number = 0;
        try {
            await GoUtils.createDependenciesTrees(projectDescriptors.get(PackageType.Go), componentsToScan, treesManager, parent, checkCanceled);
            typesDone++;
            progressManager.reportProgress();
            await NpmUtils.createDependenciesTrees(projectDescriptors.get(PackageType.Npm), componentsToScan, treesManager, parent, checkCanceled);
            typesDone++;
            progressManager.reportProgress();
            await YarnUtils.createDependenciesTrees(projectDescriptors.get(PackageType.Yarn), componentsToScan, treesManager, parent, checkCanceled);
            typesDone++;
            progressManager.reportProgress();
            await PypiUtils.createDependenciesTrees(
                projectDescriptors.get(PackageType.Python),
                workspaceFolder,
                componentsToScan,
                treesManager,
                parent,
                checkCanceled
            );
            typesDone++;
            progressManager.reportProgress();
            await MavenUtils.createDependenciesTrees(
                projectDescriptors.get(PackageType.Maven),
                componentsToScan,
                treesManager,
                parent,
                checkCanceled
            );
            typesDone++;
            progressManager.reportProgress();
            await NugetUtils.createDependenciesTrees(
                projectDescriptors.get(PackageType.Nuget),
                componentsToScan,
                treesManager,
                parent,
                checkCanceled
            );
        } finally {
            progressManager.reportProgress((getNumberOfSupportedPackageTypes() - typesDone) * progressManager.getStepIncValue);
        }

        return parent;
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
