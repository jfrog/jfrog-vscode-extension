import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { IComponent, IGraphResponse, IVulnerability } from 'jfrog-client-js';
import { IImpactedPath, ILicense } from 'jfrog-ide-webview';
import { DescriptorIssuesData } from '../../cache/issuesCache';
import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';
import { DependenciesTreeNode } from '../dependenciesTree/dependenciesTreeNode';
import { DescriptorTreeNode } from '../issuesTree/descriptorTree/descriptorTreeNode';
// import { Utils } from "./utils";
import { Severity, SeverityUtils } from '../../types/severity';
import { DependencyIssuesTreeNode } from '../issuesTree/descriptorTree/dependencyIssueTreeNode';
import { CveTreeNode } from '../issuesTree/descriptorTree/cveTreeNode';
import { PackageType } from '../../types/projectType';
import { ProjectDetails } from '../../types/projectDetails';

export class DescriptorUtils {
    /**
     *  Creates a map for each Xray issue in the response to the impact path for it in a given dependency graph.
     * @param descriptorGraph - the descriptor full dependency graph
     * @param response - the scan result issues and the dependency components for each of them
     * @returns map from issue_id to IImpactedPath for the given tree root
     */
    public static createImpactedPaths(descriptorGraph: RootNode, response: IGraphResponse): Map<string, IImpactedPath> {
        let paths: Map<string, IImpactedPath> = new Map<string, IImpactedPath>();
        let issues: IVulnerability[] = response.violations ? response.violations : response.vulnerabilities;

        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability = issues[i];
            paths.set(issue.issue_id, {
                name: descriptorGraph.componentId,
                children: this.getChildrenImapct(descriptorGraph, new Map<string, IComponent>(Object.entries(issue.components)))
            } as IImpactedPath);
        }
        return paths;
    }

    /**
     *  Get the impact path of all the children of a given root, recusevly, if exists (at least one component has issue in the path)
     * @param root - the root to get it's children impact
     * @param componentsWithIssue - map of dependencyId ->
     * @returns array of impact paths one for each child if exists
     */
    public static getChildrenImapct(root: DependenciesTreeNode, componentsWithIssue: Map<string, IComponent>): IImpactedPath[] {
        let impactPaths: IImpactedPath[] = [];
        for (let child of root.children) {
            // Direct impact
            if (child.dependencyId && componentsWithIssue.has(child.dependencyId)) {
                impactPaths.push({
                    name: child.componentId,
                    children: []
                } as IImpactedPath);
                continue;
            }
            // indirect impact
            let impactChild: IImpactedPath | undefined = impactPaths.find(p => p.name === child.componentId);
            if (!impactChild) {
                let indirectImpact: IImpactedPath[] = this.getChildrenImapct(child, componentsWithIssue);
                if (indirectImpact.length > 0) {
                    impactPaths.push({
                        name: child.componentId,
                        children: indirectImpact
                    } as IImpactedPath);
                }
            }
        }
        return impactPaths;
    }

    private static counter: number = 0;

    // TODO: Move to ScanUtils
    public static populateDescriptorData(descriptorNode: DescriptorTreeNode, descriptorData: DescriptorIssuesData): number {
        let graphResponse: IGraphResponse = descriptorData.dependenciesGraphScan;
        let impactedPaths: Map<string, IImpactedPath> = new Map<string, IImpactedPath>(Object.entries(descriptorData.convertedImpact));
        // this._treesManager.logManager.logMessage('impact: ' + impactedPaths, 'DEBUG');
        impactedPaths;

        // TODO: remove saving files below
        let scanPath: string = '/Users/assafa/Documents/response-' + this.counter++ + '.json';
        fs.writeFileSync(scanPath, JSON.stringify(graphResponse));

        let issues: IVulnerability[] = graphResponse.violations ? graphResponse.violations : graphResponse.vulnerabilities;
        let topSeverity: Severity = Severity.Unknown;
        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability = issues[i];
            let impactedPath: IImpactedPath | undefined = impactedPaths.get(issue.issue_id);
            // this._treesManager.logManager.logMessage("impacted path for '" + issue.issue_id + "':\n" + impactedPath, 'DEBUG');
            let severity: Severity = SeverityUtils.getSeverity(issue.severity);
            if (severity > topSeverity) {
                topSeverity = severity;
            }

            for (let [componentId, component] of Object.entries(issue.components)) {
                let dependencyWithIssue: DependencyIssuesTreeNode | undefined = descriptorNode.getDependencyByID(componentId);

                if (dependencyWithIssue == undefined) {
                    dependencyWithIssue = new DependencyIssuesTreeNode(componentId, component, severity, descriptorNode, impactedPath);
                    descriptorNode.dependenciesWithIssue.push(dependencyWithIssue);
                } else if (severity > dependencyWithIssue.topSeverity) {
                    dependencyWithIssue.topSeverity = severity;
                }

                for (let cveIssue of issue.cves) {
                    dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, cveIssue));
                }
            }
        }
        descriptorNode.severity = topSeverity;
        descriptorNode.dependencyScanTimeStamp = descriptorData.graphScanTimestamp;

        graphResponse.licenses.forEach(license => {
            Object.values(license.components).forEach(component => {
                let dependencyWithIssue: DependencyIssuesTreeNode | undefined = descriptorNode.searchDependency(
                    component.package_type,
                    component.package_name,
                    component.package_version
                );
                if (dependencyWithIssue != undefined) {
                    dependencyWithIssue.licenses.push({ name: license.license_name } as ILicense); // TODO: tell or, what is the plan about those
                }
            });
        });

        return descriptorNode.dependenciesWithIssue.length;
    }

    // TODO: Move to ScanUtils
    // returns the full path of the descriptor file if exsits in map or artifactId of the root otherwise
    public static getDescriptorFullPath(descriptorRoot: RootNode, workspcaeDescriptors: Map<PackageType, vscode.Uri[]>): string {
        // TODO: insert this inside the logic of building the tree ?
        let details: ProjectDetails = descriptorRoot.projectDetails;
        let descriptorName: string = descriptorRoot.generalInfo.artifactId;
        let typeDescriptors: vscode.Uri[] | undefined = workspcaeDescriptors.get(details.type);
        if (typeDescriptors != undefined) {
            for (let descriptor of typeDescriptors) {
                let descriptorDir: string = path.dirname(descriptor.fsPath);
                if (descriptorDir == details.path) {
                    descriptorName = descriptor.fsPath;
                    break;
                }
            }
        }
        return descriptorName;
    }
}
