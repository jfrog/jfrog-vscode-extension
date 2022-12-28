import * as vscode from 'vscode';
import * as path from 'path';
import { IComponent, IGraphResponse, IViolation, IVulnerability } from 'jfrog-client-js';
import { DescriptorIssuesData } from '../../cache/issuesCache';
import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';
import { DependenciesTreeNode } from '../dependenciesTree/dependenciesTreeNode';
import { DescriptorTreeNode } from '../issuesTree/descriptorTree/descriptorTreeNode';
import { Severity, SeverityUtils } from '../../types/severity';
import { DependencyIssuesTreeNode } from '../issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { CveTreeNode } from '../issuesTree/descriptorTree/cveTreeNode';
import { PackageType } from '../../types/projectType';
import { LicenseIssueTreeNode } from '../issuesTree/descriptorTree/licenseIssueTreeNode';
import { GoUtils } from '../../utils/goUtils';
import { MavenUtils } from '../../utils/mavenUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { PypiUtils } from '../../utils/pypiUtils';
import { YarnUtils } from '../../utils/yarnUtils';
import { IImpactedPath, ILicense } from 'jfrog-ide-webview';
import { IssueTreeNode } from '../issuesTree/issueTreeNode';
import { FocusType } from '../../constants/contextKeys';

export class DescriptorUtils {
    /**
     *  Creates a map for each Xray issue in the response to the impact path in the given dependency graph.
     * @param descriptorGraph - the descriptor full dependency graph
     * @param response - the scan result issues and the dependency components for each of them
     * @returns map from issue_id to IImpactedPath for the given tree root
     */
    public static createImpactedPaths(descriptorGraph: RootNode, response: IGraphResponse): Map<string, IImpactedPath> {
        let paths: Map<string, IImpactedPath> = new Map<string, IImpactedPath>();
        let issues: IVulnerability[] = response.violations || response.vulnerabilities;

        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability = issues[i];
            paths.set(issue.issue_id, {
                name: descriptorGraph.componentId,
                children: this.getChildrenImpact(descriptorGraph, new Map<string, IComponent>(Object.entries(issue.components)))
            } as IImpactedPath);
        }
        return paths;
    }

    /**
     *  Get the impact path of all the children of a given root, recusevly, if exists at least one component that has issue in the path
     * @param root - the root to get it's children impact
     * @param componentsWithIssue - map of artifactId -> component, if component exists in the map it has issue
     * @returns array of impact paths one for each child if exists
     */
    public static getChildrenImpact(root: DependenciesTreeNode, componentsWithIssue: Map<string, IComponent>): IImpactedPath[] {
        let impactPaths: IImpactedPath[] = [];
        for (let child of root.children) {
            let impactChild: IImpactedPath | undefined = impactPaths.find(p => p.name === child.componentId);
            if (!impactChild) {
                if (child.dependencyId && componentsWithIssue.has(child.dependencyId)) {
                    // Direct impact
                    impactPaths.push({
                        name: child.componentId
                    } as IImpactedPath);
                }
                // indirect impact
                let indirectImpact: IImpactedPath[] = this.getChildrenImpact(child, componentsWithIssue);
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

    /**
     * Populate the provided issues data to the descriptor node (view element)
     * @param descriptorNode - the descriptor node that will be populated
     * @param descriptorData - the issues data that the descriptor has
     * @returns the number of issues was populated in the descriptor node
     */
    public static populateDescriptorData(descriptorNode: DescriptorTreeNode, descriptorData: DescriptorIssuesData): number {
        // Get the information from data
        let graphResponse: IGraphResponse = descriptorData.dependenciesGraphScan;
        descriptorNode.dependencyScanTimeStamp = descriptorData.graphScanTimestamp;
        let impactedPaths: Map<string, IImpactedPath> = new Map<string, IImpactedPath>(Object.entries(descriptorData.impactTreeData));
        let issues: IVulnerability[] | IViolation[] = graphResponse.violations || graphResponse.vulnerabilities;
        let topSeverity: Severity = Severity.Unknown;
        // Populate issues
        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability | IViolation = issues[i];
            let impactedPath: IImpactedPath | undefined = impactedPaths.get(issue.issue_id);
            // Update the top severity of the descriptor
            let severity: Severity = SeverityUtils.getSeverity(issue.severity);
            if (severity > topSeverity) {
                topSeverity = severity;
            }
            // Populate the issue for each dependency component
            for (let [componentId, component] of Object.entries(issue.components)) {
                let dependencyWithIssue: DependencyIssuesTreeNode = this.getOrCreateDependecyWithIssue(
                    descriptorNode,
                    componentId,
                    component,
                    severity
                );

                let violationIssue: IViolation = <IViolation>issue;
                let matchIssue: IssueTreeNode | undefined = dependencyWithIssue.issues.find(i => i.issueId == issue.issue_id);
                if (violationIssue && matchIssue) {
                    // In case multiple watches are assigned and there are componenets that overlap between the watches
                    // Xray will return component duplication (just watch_name different), combine those results
                    matchIssue.watchNames?.push(violationIssue.watch_name);
                } else {
                    if (violationIssue && violationIssue.license_key) {
                        dependencyWithIssue.issues.push(new LicenseIssueTreeNode(violationIssue, severity, dependencyWithIssue, impactedPath));
                    } else {
                        if (issue.cves) {
                            for (let cveIssue of issue.cves) {
                                dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, impactedPath, cveIssue));
                            }
                        } else {
                            dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, impactedPath));
                        }
                    }
                }
            }
        }
        descriptorNode.severity = topSeverity;
        // Populate licenses
        if (graphResponse.licenses) {
            graphResponse.licenses.forEach(license => {
                Object.entries(license.components)
                    .map(entry => entry[0])
                    .forEach(componentId => {
                        let dependencyWithIssue: DependencyIssuesTreeNode | undefined = descriptorNode.getDependencyByID(componentId);
                        dependencyWithIssue?.licenses.push({ name: license.license_key } as ILicense);
                    });
            });
        }
        return descriptorNode.dependenciesWithIssue.length;
    }

    /**
     * Search for the dependency in the descriptor base on componentId.
     * If found will update the top severity of the node if the given sevirity is higher.
     * If not found it will create a new one and add it to the descriptor node
     * @param descriptorNode - the parent that we want to search its nodes
     * @param componentId - the id (type,name,version) of the dependency
     * @param component - the dependecy data to create
     * @param severity - the severity to create/update
     * @returns the dependency object if exists, else a newly created one base on the input
     */
    public static getOrCreateDependecyWithIssue(
        descriptorNode: DescriptorTreeNode,
        componentId: string,
        component: IComponent,
        severity: Severity
    ): DependencyIssuesTreeNode {
        let dependencyWithIssue: DependencyIssuesTreeNode | undefined = descriptorNode.getDependencyByID(componentId);
        if (!dependencyWithIssue) {
            dependencyWithIssue = new DependencyIssuesTreeNode(componentId, component, severity, descriptorNode);
            descriptorNode.dependenciesWithIssue.push(dependencyWithIssue);
        } else if (severity > dependencyWithIssue.severity) {
            dependencyWithIssue.severity = severity;
        }
        return dependencyWithIssue;
    }

    /**
     * Get the dependency graph of a descriptor base on a given path
     * @param workspaceDependenciesTree - the dependencies graph for all the descriptors in the workspace
     * @param descriptorPath - the descriptor we want to fetch its sub tree graph
     * @returns the descriptor dependencies tree if exsits the provided workspace tree, undefined otherwise
     */
    public static getDependencyGraph(workspaceDependenciesTree: DependenciesTreeNode, descriptorPath: string): RootNode | undefined {
        // Search for the dependecy graph of the descriptor
        let descriptorDir: string = path.dirname(descriptorPath);
        for (const child of workspaceDependenciesTree.children) {
            if (child instanceof RootNode) {
                let graph: RootNode | undefined = this.searchDependencyGraph(descriptorDir, child);
                if (graph) {
                    return graph;
                }
            }
        }
        return undefined;
    }

    public static searchDependencyGraph(descriptorDir: string, node: RootNode): RootNode | undefined {
        if (node.fullPath == descriptorDir || node.projectDetails.path == descriptorDir) {
            return node;
        }
        for (const child of node.children) {
            if (child instanceof RootNode) {
                let graph: RootNode | undefined = this.searchDependencyGraph(descriptorDir, child);
                if (graph) {
                    return graph;
                }
            }
        }
        return undefined;
    }

    /**
     * Get the positions a specific depdndecy appers in a descriptor file
     * @param document - the descriptor document we want to search in
     * @param packageType - the type of packge this descriptor has
     * @param dependencyId - the dependency id we want to search
     * @returns the list of positions in the document this dependency appers in
     */
    public static getDependencyPosition(document: vscode.TextDocument, packageType: PackageType, dependencyId: string): vscode.Position[] {
        let dependencyName: string = packageType == PackageType.Maven ? dependencyId : dependencyId.substring(0, dependencyId.lastIndexOf(':'));

        switch (packageType) {
            case PackageType.Go:
                return GoUtils.getDependencyPosition(document, dependencyName, FocusType.Dependency);
            case PackageType.Maven:
                return MavenUtils.getDependencyPosition(document, dependencyName, FocusType.Dependency);
            case PackageType.Npm:
                return NpmUtils.getDependencyPosition(document, dependencyName, FocusType.Dependency);
            case PackageType.Python:
                return PypiUtils.getDependencyPosition(document, dependencyName);
            case PackageType.Yarn:
                return YarnUtils.getDependencyPosition(document, dependencyName);
            default:
                return [];
        }
    }
}
