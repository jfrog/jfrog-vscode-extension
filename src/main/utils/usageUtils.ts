import * as vscode from 'vscode';
import { IUsageFeature } from 'jfrog-client-js';
import { PackageType } from '../types/projectType';
import { SupportedScans } from '../scanLogic/scanManager';
import { ConnectionManager } from '../connect/connectionManager';
import { ApplicabilityRunner } from '../scanLogic/scanRunners/applicabilityScan';

export class UsageUtils {
    private static getUsageFeaturesByExistTech(
        projectDescriptors: Map<PackageType, vscode.Uri[]>,
        scanSuffix: string,
        onlyInclude?: PackageType[]
    ): IUsageFeature[] {
        let features: IUsageFeature[] = [];
        for (const [techEnum, descriptors] of projectDescriptors.entries()) {
            // If we only support subset of the techs, check if tech is supported.
            if (onlyInclude && onlyInclude.length > 0 && !onlyInclude.includes(techEnum)) {
                continue;
            }
            // Only add to usage if found descriptors for tech.
            if (!!descriptors && descriptors.length > 0) {
                const featureName: string = PackageType[techEnum].toLowerCase() + '-' + scanSuffix;
                features.push({ featureId: featureName });
            }
        }
        return features;
    }

    /**
     * Sends usage report for all techs we found project descriptors of and for each advance scan that was preformed.
     * @param supportedScans - the entitlement for each scan
     * @param projectDescriptors - map of all project descriptors by their tech.
     * @param connectionManager - manager containing Artifactory details if configured.
     */
    public static async sendUsageReport(
        supportedScans: SupportedScans,
        projectDescriptors: Map<PackageType, vscode.Uri[]>,
        connectionManager: ConnectionManager
    ) {
        let features: IUsageFeature[] = [];
        if (supportedScans.dependencies) {
            features.push(...this.getUsageFeaturesByExistTech(projectDescriptors, 'deps'));
        }
        if (supportedScans.applicability) {
            features.push(...this.getUsageFeaturesByExistTech(projectDescriptors, 'contextual', ApplicabilityRunner.supportedPackageTypes()));
        }
        if (supportedScans.iac) {
            features.push({ featureId: 'iac' });
        }
        if (supportedScans.secrets) {
            features.push({ featureId: 'secrets' });
        }
        if (features.length === 0) {
            return;
        }
        await connectionManager.sendUsageReport(features);
    }
}
