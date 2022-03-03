import { ComponentDetails, IGraphLicense, IGraphResponse, IViolation, IVulnerability } from 'jfrog-client-js';
import Dictionary from 'typescript-collections/dist/lib/Dictionary';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { IIssueCacheObject } from '../types/issueCacheObject';
import { IIssueKey } from '../types/issueKey';
import { ILicenseCacheObject } from '../types/licenseCacheObject';
import { ILicenseKey } from '../types/licenseKey';
import { INodeInfo } from '../types/nodeInfo';
import { Severity } from '../types/severity';
import { Configuration } from '../utils/configuration';
import { Translators } from '../utils/translators';
import { AbstractScanLogic } from './abstractScanLogic';

/**
 * Used in Xray >= 3.29.0.
 * Run /scan/graph REST API and populate the cache with the results.
 * When the project key is provided - only violated vulnerabilities should appear in the results. Licenses may mark as violated.
 * When the project key isn't provided - all vulnerabilities and licenses information should appear in the results.
 */
export class GraphScanLogic extends AbstractScanLogic {
    public async scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Set<ComponentDetails>,
        checkCanceled: () => void
    ) {
        let graphResponse: IGraphResponse = await this._connectionManager.scanGraph(
            componentsToScan,
            progress,
            checkCanceled,
            Configuration.getProjectKey()
        );
        let scannedComponents: Map<string, INodeInfo> = new Map();
        let licenses: Dictionary<string, ILicenseCacheObject> = new Dictionary();
        let issues: IIssueCacheObject[] = [];

        if (graphResponse.violations) {
            this.populateViolations(graphResponse.violations, issues, licenses, scannedComponents);
        }
        if (graphResponse.vulnerabilities) {
            this.populateVulnerabilities(graphResponse.vulnerabilities, issues, scannedComponents);
        }
        if (graphResponse.licenses) {
            this.populateLicenses(graphResponse.licenses, licenses, scannedComponents);
        }

        this.addMissingComponents(componentsToScan, scannedComponents);
        await this._scanCacheManager.storeComponents(scannedComponents, issues, licenses.values());
    }

    private populateViolations(
        violations: IViolation[],
        issues: IIssueCacheObject[],
        licenses: Dictionary<string, ILicenseCacheObject>,
        scannedComponents: Map<string, INodeInfo>
    ) {
        for (const violation of violations) {
            if (violation.license_key && violation.license_key !== '') {
                this.populateLicense(violation, licenses, scannedComponents, true);
            } else {
                this.populateVulnerability(violation, issues, scannedComponents);
            }
        }
    }

    private populateVulnerabilities(vulnerabilities: IVulnerability[], issues: IIssueCacheObject[], scannedComponents: Map<string, INodeInfo>) {
        for (const vuln of vulnerabilities) {
            this.populateVulnerability(vuln, issues, scannedComponents);
        }
    }

    private populateVulnerability(vuln: IVulnerability, issues: IIssueCacheObject[], scannedComponents: Map<string, INodeInfo>) {
        for (let [componentId, vulnComponent] of Object.entries(vuln.components)) {
            // Add vulnerability to the issues array
            let severity: Severity = Translators.toSeverity(vuln.severity);
            issues.push({
                issueId: vuln.issue_id,
                severity: severity,
                summary: vuln.summary != '' ? vuln.summary : 'N/A',
                fixedVersions: vulnComponent.fixed_versions,
                cves: Translators.toCves(vuln.cves),
                references: Translators.cleanReferencesLink(vuln.references)
            } as IIssueCacheObject);

            // Add vulnerability to the scanned commponents map
            this.addIssueToScannedComponents(scannedComponents, this.getShortComponentId(componentId), vuln.issue_id, severity);
        }
    }

    private addIssueToScannedComponents(scannedComponents: Map<string, INodeInfo>, componentId: string, issueId: string, severity: Severity) {
        let nodeInfo: INodeInfo | undefined = scannedComponents.get(componentId);
        if (!nodeInfo) {
            nodeInfo = this.createNodeInfo(severity);
        } else if (severity > nodeInfo.top_severity) {
            nodeInfo.top_severity = severity;
        }
        nodeInfo.issues.push({ component: componentId, issue_id: issueId } as IIssueKey);
        scannedComponents.set(componentId, nodeInfo);
    }

    private populateLicenses(
        scannedLicenses: IGraphLicense[],
        licenses: Dictionary<string, ILicenseCacheObject>,
        scannedComponents: Map<string, INodeInfo>
    ) {
        for (const license of scannedLicenses) {
            // If the license is violated, we want to keep it as is. Therefore we will add only licenses which haven't been added in populateViolations.
            if (!licenses.containsKey(license.license_key)) {
                this.populateLicense(license, licenses, scannedComponents, false);
            }
        }
    }

    private populateLicense(
        scannedLicense: IGraphLicense,
        licenses: Dictionary<string, ILicenseCacheObject>,
        scannedComponents: Map<string, INodeInfo>,
        violated: boolean
    ) {
        let moreInfoUrl: string = scannedLicense.references && scannedLicense.references.length > 0 ? scannedLicense.references[0] : '';
        // Add license to the licenses map
        licenses.setValue(scannedLicense.license_key, {
            name: scannedLicense.license_key,
            fullName: scannedLicense.license_name,
            violated: violated,
            moreInfoUrl: moreInfoUrl
        } as ILicenseCacheObject);
        for (let componentId of Object.keys(scannedLicense.components)) {
            // Add license to the scanned components map
            this.addLicenseToScannedComponents(scannedComponents, this.getShortComponentId(componentId), scannedLicense.license_key, violated);
        }
    }

    private addLicenseToScannedComponents(scannedComponents: Map<string, INodeInfo>, componentId: string, licenseName: string, violated: boolean) {
        let nodeInfo: INodeInfo = scannedComponents.get(componentId) || this.createNodeInfo(Severity.Normal);
        nodeInfo.licenses.push({ licenseName: licenseName, violated: violated } as ILicenseKey);
        scannedComponents.set(componentId, nodeInfo);
    }

    private addMissingComponents(componentsToScan: Set<ComponentDetails>, scannedComponents: Map<string, INodeInfo>): void {
        componentsToScan.forEach(componentToScan => {
            let componentId: string = this.getShortComponentId(componentToScan.component_id);
            if (!scannedComponents.has(componentId)) {
                scannedComponents.set(componentId, this.createNodeInfo());
            }
        });
    }

    private getShortComponentId(componentId: string): string {
        return componentId.substring(componentId.indexOf('://') + 3);
    }

    private createNodeInfo(topSeverity: Severity = Severity.Unknown): INodeInfo {
        return { top_severity: topSeverity, issues: [] as IIssueKey[], licenses: [] as ILicenseKey[] } as INodeInfo;
    }
}
