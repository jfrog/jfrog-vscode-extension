import { IUsageFeature } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { PackageType } from '../types/projectType';

export class UsageUtils {
    private static translateToUsageFeature(usageFeatureDetails: Set<UsageJasScanType>): IUsageFeature[] {
        let features: IUsageFeature[] = [];
        for (const feature of usageFeatureDetails) {
            features.push({ featureId: feature });
        }
        return features;
    }

    private static getUsageFeaturesByExistTech(projectDescriptors: Map<PackageType, vscode.Uri[]>, scanSuffix: string): IUsageFeature[] {
        let features: IUsageFeature[] = [];
        if (!projectDescriptors || projectDescriptors.size === 0) {
            return features;
        }
        for (const [techEnum, descriptors] of projectDescriptors.entries()) {
            // Only add to usage if found descriptors for tech.
            if (!!descriptors && descriptors.length > 0) {
                const featureName: string = PackageType[techEnum].toLowerCase() + '-' + scanSuffix;
                features.push({ featureId: featureName });
            }
        }
        return features;
    }

    public static async sendUsageReport(
        usageFeatureDetails: Set<UsageJasScanType>,
        projectDescriptors: Map<PackageType, vscode.Uri[]>,
        connectionManager: ConnectionManager
    ) {
        const features: IUsageFeature[] = [];
        features.push(...UsageUtils.translateToUsageFeature(usageFeatureDetails), ...this.getUsageFeaturesByExistTech(projectDescriptors, 'deps'));
        if (features.length === 0) {
            return;
        }
        await connectionManager.sendUsageReport(features);
    }
}

export enum UsageJasScanType {
    IAC = 'iac',
    SAST = 'sast',
    SERCRETS = 'secrets',
    APPLICABILITY = 'contextual'
}
