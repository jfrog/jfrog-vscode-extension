import * as vscode from 'vscode';
import * as path from 'path';
import { IComponent, IGraphResponse, IViolation, IVulnerability } from 'jfrog-client-js';
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
import { DescriptorIssuesData } from '../../types/issuesData';

export class DescriptorUtils {
    /**
     * Creates a map for each Xray issue in a component (key= issue_id+componentId) in the response to the impact path in the given dependency graph.
     * @param descriptorGraph - the descriptor full dependency graph
     * @param response - the scan result issues and the dependency components for each of them
     * @returns map from (issue_id+componentId) to IImpactedPath for the given tree root
     */
    public static createImpactedPaths(descriptorGraph: RootNode, response: IGraphResponse): Map<string, IImpactedPath> {
        let paths: Map<string, IImpactedPath> = new Map<string, IImpactedPath>();
        let issues: IVulnerability[] = response.violations || response.vulnerabilities;

        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability = issues[i];
            for (let [componentId, component] of Object.entries(issue.components)) {
                paths.set(issue.issue_id + componentId, {
                    name: descriptorGraph.componentId,
                    children: this.getChildrenImpact(descriptorGraph, component)
                } as IImpactedPath);
            }
        }
        return paths;
    }

    /**
     * Get the impact path of all the children of a given root, recursively, if exists a component that has issue in the path
     * @param root - the root to get it's children impact
     * @param componentWithIssue - the component to generate the impact path for it
     * @returns array of impact paths one for each child if exists
     */
    public static getChildrenImpact(root: DependenciesTreeNode, componentWithIssue: IComponent): IImpactedPath[] {
        let impactPaths: IImpactedPath[] = [];
        for (let child of root.children) {
            let impactChild: IImpactedPath | undefined = impactPaths.find(p => p.name === child.componentId);
            if (!impactChild) {
                if (child.componentId === componentWithIssue.package_name + ':' + componentWithIssue.package_version) {
                    // Direct impact
                    impactPaths.push({
                        name: child.componentId
                    } as IImpactedPath);
                }
                // indirect impact
                let indirectImpact: IImpactedPath[] = this.getChildrenImpact(child, componentWithIssue);
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
     * Create an Issue node child for a dependency issues node base on a given IVulnerability
     * @param issue - the issue to create the child node from
     * @param dependencyWithIssue - the parent of this issue
     * @param severity - the severity of this issue
     * @param impactedPath - the impacted path graph of this issue
     */
    private static populateDependencyIssue(
        issue: IVulnerability,
        dependencyWithIssue: DependencyIssuesTreeNode,
        severity: Severity,
        component: IComponent,
        impactedPath?: IImpactedPath
    ) {
        let violationIssue: IViolation = <IViolation>issue;
        if (violationIssue && violationIssue.license_key && impactedPath) {
            // License violation
            dependencyWithIssue.issues.push(new LicenseIssueTreeNode(violationIssue, severity, dependencyWithIssue, impactedPath));
        } else {
            if (issue.cves) {
                // CVE issue
                for (let cveIssue of issue.cves) {
                    dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, component, impactedPath, cveIssue));
                }
            } else {
                // Xray issue
                dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, component, impactedPath));
            }
        }
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
        let directComponents: Set<string> = this.getDirectComponents(impactedPaths);
        let issues: IVulnerability[] | IViolation[] = graphResponse.violations || graphResponse.vulnerabilities;
        // Populate issues
        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability | IViolation = issues[i];
            let severity: Severity = SeverityUtils.getSeverity(issue.severity);
            // Populate the issue for each dependency component
            for (let [artifactId, component] of Object.entries(issue.components)) {
                let impactedPath: IImpactedPath | undefined = impactedPaths.get(issue.issue_id + artifactId);

                let dependencyWithIssue: DependencyIssuesTreeNode = descriptorNode.addNode(
                    artifactId,
                    component,
                    // Search if the dependency is indirect
                    !directComponents.has(component.package_name + ':' + component.package_version)
                );

                let matchIssue: IssueTreeNode | undefined = dependencyWithIssue.issues.find(issueExists => issueExists.issueId === issue.issue_id);
                let violationIssue: IViolation = <IViolation>issue;
                if (matchIssue && violationIssue.watch_name && !matchIssue.watchNames.includes(violationIssue.watch_name)) {
                    // In case multiple watches are assigned and there are components that overlap between the watches
                    // Xray will return component duplication (just watch_name different), combine those results
                    matchIssue.watchNames.push(violationIssue.watch_name);
                } else if (!matchIssue) {
                    this.populateDependencyIssue(issue, dependencyWithIssue, severity, component, impactedPath);
                }
            }
        }
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
     * Convert descriptor impacted paths to a set of direct components that are impacted.
     * The first children are the direct components.
     * @param impactedPaths - the impacted path to convert
     * @returns set of direct components in the impacted path
     */
    public static getDirectComponents(impactedPaths: Map<string, IImpactedPath>): Set<string> {
        let result: Set<string> = new Set<string>();

        for (const impactedPath of impactedPaths.values()) {
            if (impactedPath.children) {
                for (const directPath of impactedPath.children) {
                    result.add(directPath.name);
                }
            }
        }

        return result;
    }

    /**
     * Get the dependency graph of a descriptor base on a given path
     * @param workspaceDependenciesTree - the dependencies graph for all the descriptors in the workspace
     * @param descriptorPath - the descriptor we want to fetch its sub tree graph
     * @returns the descriptor dependencies tree if exists the provided workspace tree, undefined otherwise
     */
    public static getDependencyGraph(workspaceDependenciesTree: DependenciesTreeNode, descriptorPath: string): RootNode | undefined {
        // Search for the dependency graph of the descriptor
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

    private static searchDependencyGraph(descriptorDir: string, node: RootNode): RootNode | undefined {
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
     * Get the positions a specific dependency appears in a descriptor file
     * @param document - the descriptor document we want to search in
     * @param packageType - the type of package this descriptor has
     * @param dependencyId - the dependency id we want to search
     * @returns the list of positions in the document this dependency appears in
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
