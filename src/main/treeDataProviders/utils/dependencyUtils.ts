import { IComponent, IGraphResponse, IViolation, IVulnerability } from 'jfrog-client-js';
import { IImpactGraph, ILicense } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { FocusType } from '../../constants/contextKeys';
import { LogManager } from '../../log/logManager';
import { ScanManager } from '../../scanLogic/scanManager';
import { GeneralInfo } from '../../types/generalInfo';
import { PackageType } from '../../types/projectType';
import { Severity, SeverityUtils } from '../../types/severity';
import { DependencyScanResults } from '../../types/workspaceIssuesDetails';
import { GoUtils } from '../../utils/goUtils';
import { MavenUtils } from '../../utils/mavenUtils';
import { NpmUtils } from '../../utils/npmUtils';
import { NugetUtils } from '../../utils/nugetUtils';
import { PypiUtils } from '../../utils/pypiUtils';
import { FileScanBundle, FileScanError, ScanUtils } from '../../utils/scanUtils';
import { YarnUtils } from '../../utils/yarnUtils';
import { RootNode } from '../dependenciesTree/dependenciesRoot/rootTree';
import { VirtualEnvPypiTree } from '../dependenciesTree/dependenciesRoot/virtualEnvPypiTree';
import { DependenciesTreeNode } from '../dependenciesTree/dependenciesTreeNode';
import { CveTreeNode } from '../issuesTree/descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from '../issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from '../issuesTree/descriptorTree/descriptorTreeNode';
import { EnvironmentTreeNode } from '../issuesTree/descriptorTree/environmentTreeNode';
import { LicenseIssueTreeNode } from '../issuesTree/descriptorTree/licenseIssueTreeNode';
import { ProjectDependencyTreeNode } from '../issuesTree/descriptorTree/projectDependencyTreeNode';
import { FileTreeNode } from '../issuesTree/fileTreeNode';
import { IssueTreeNode } from '../issuesTree/issueTreeNode';
import { GraphScanProgress } from './stepProgress';
import { ApplicabilityRunner } from '../../scanLogic/scanRunners/applicabilityScan';
import { PnpmUtils } from '../../utils/pnpmUtils';
import { WorkspaceScanDetails } from '../../types/workspaceScanDetails';

export class DependencyUtils {
    public static readonly FAIL_TO_SCAN: string = '[Fail to scan]';

    /**
     * Scan all the dependencies of a given package for security issues and populate the given data and view objects with the information.
     * @param scanManager - the scanManager that preforms the actual scans
     * @param scanDetails - all the scan information needed for the scan (data, view, progressManager) the data object that hold the workspace issues and will be populated with data
     * @param root - the root view object of the workspace issues and will be populated with nodes
     * @param type - Package type to scan it's dependencies
     * @param descriptorsPaths - the paths for all the descriptors of the package type
     * @param progressManager - the progress manager of the workspace scan
     * @param contextualScan - if true (default), will apply contextual analysis scan if Cve detected
     */
    public static async scanPackageDependencies(
        scanManager: ScanManager,
        scanDetails: WorkspaceScanDetails,
        type: PackageType,
        descriptorsPaths: vscode.Uri[]
    ): Promise<any> {
        let scansPromises: Promise<any>[] = [];
        let descriptorsParsed: Set<string> = new Set<string>();
        // Build dependency tree for all the package descriptors
        let packageDependenciesTree: DependenciesTreeNode = await DependencyUtils.createDependenciesTree(
            scanDetails.viewRoot.workspace,
            type,
            descriptorsPaths,
            () => scanDetails.progressManager.onProgress,
            scanManager.logManager
        );
        scanDetails.progressManager.reportProgress();
        // Adjust progress value with 2 substeps and the new number of discovered project dependency tree items.
        let progressIncValue: number =
            (descriptorsPaths.length / packageDependenciesTree.children.length) * scanDetails.progressManager.getStepIncValue;
        let bundlesWithIssues: FileScanBundle[] = [];
        for (let child of packageDependenciesTree.children) {
            if (child instanceof RootNode) {
                // Create bundle for the scan
                descriptorsParsed.add(child.fullPath);
                let scanBundle: FileScanBundle = {
                    multiScanId: scanDetails.multiScanId,
                    workspaceResults: scanDetails.results,
                    rootNode: scanDetails.viewRoot,
                    data: child.createEmptyScanResultsObject()
                };
                if (this.isGraphHasBuildError(child, scanBundle, scanManager.logManager)) {
                    scanDetails.progressManager.reportProgress(progressIncValue);
                    continue;
                }
                if (child.children.length > 0) {
                    scanBundle.dataNode = DependencyUtils.toProjectDependencyNode(child);
                    // Scan the descriptor
                    scansPromises.push(
                        DependencyUtils.createDependencyScanTask(
                            scanManager,
                            scanBundle,
                            child,
                            scanDetails.progressManager.createScanProgress(child.fullPath, progressIncValue / 2)
                        )
                            .then(issueCount => {
                                if (issueCount > 0) {
                                    bundlesWithIssues.push(scanBundle);
                                }
                            })
                            .finally(() => scanDetails.progressManager.reportProgress(progressIncValue / 2))
                    );
                }
            }
            // Not root or have no dependencies
            // Has to be at least after error checks because files with errors has no dependencies
            scanDetails.progressManager.reportProgress(progressIncValue);
            descriptorsParsed.add(child.generalInfo.path);
        }
        this.reportNotFoundDescriptors(descriptorsPaths, descriptorsParsed, scanManager.logManager);

        await Promise.all(scansPromises);
        const applicableRunners: ApplicabilityRunner | undefined = await scanDetails.jasRunnerFactory.createApplicabilityRunner(
            bundlesWithIssues,
            type
        );
        if (applicableRunners?.shouldRun()) {
            await applicableRunners.scan({ msi: scanDetails.multiScanId }).catch(err => ScanUtils.onScanError(err, scanManager.logManager, true));
        }
    }

    private static isGraphHasBuildError(child: RootNode, scanBundle: FileScanBundle, logManager: LogManager) {
        if (child.buildError) {
            DependencyUtils.onFileScanError(
                new FileScanError('Project with descriptor file ' + child.fullPath + ' has error ' + child.buildError, child.buildError),
                logManager,
                scanBundle
            );
            return true;
        }
        return false;
    }

    private static reportNotFoundDescriptors(descriptorsPaths: vscode.Uri[], descriptorsParsed: Set<string>, logManager: LogManager) {
        let notFoundDescriptors: string[] = descriptorsPaths
            .map(descriptorPath => descriptorPath.fsPath)
            .filter(descriptorPath => !descriptorsParsed.has(descriptorPath));
        if (notFoundDescriptors.length > 0) {
            logManager.logMessage("Can't find descriptors graph for: " + notFoundDescriptors, 'DEBUG');
        }
    }

    private static async createDependenciesTree(
        workspace: vscode.WorkspaceFolder,
        packageType: PackageType,
        descriptors: vscode.Uri[],
        onProgress: () => void,
        log: LogManager,
        parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', PackageType.Unknown))
    ): Promise<DependenciesTreeNode> {
        switch (packageType) {
            case PackageType.Go:
                await GoUtils.createDependenciesTrees(descriptors, log, onProgress, parent);
                break;
            case PackageType.Maven:
                await MavenUtils.createDependenciesTrees(descriptors, log, onProgress, parent);
                break;
            case PackageType.Npm:
                await NpmUtils.createDependenciesTrees(descriptors, log, onProgress, parent);
                break;
            case PackageType.Pnpm:
                await PnpmUtils.createDependenciesTrees(descriptors, log, onProgress, parent);
                break;
            case PackageType.Python:
                await PypiUtils.createDependenciesTrees(descriptors, workspace, log, onProgress, parent);
                break;
            case PackageType.Yarn:
                await YarnUtils.createDependenciesTrees(descriptors, log, onProgress, parent);
                break;
            case PackageType.Nuget:
                await NugetUtils.createDependenciesTrees(descriptors, log, onProgress, parent);
                break;
        }
        // flatten parent to contain all sub RootNode in package to be also direct children for projects with sub modules
        for (let root of parent.children) {
            if (root instanceof RootNode) {
                let flattenSubRootsNotDirectChild: RootNode[] = root.flattenRootChildren().filter(child => !parent.children.includes(child));
                for (let notDirectChild of flattenSubRootsNotDirectChild) {
                    parent.addChild(notDirectChild);
                }
            }
        }
        return parent;
    }

    private static toProjectDependencyNode(child: RootNode): ProjectDependencyTreeNode {
        if (child instanceof VirtualEnvPypiTree) {
            return child.toEnvironmentTreeNode();
        }
        return new DescriptorTreeNode(child.fullPath, child.projectDetails.type);
    }

    /**
     * Runs the dependencies scans asynchronously.
     * 1. Dependency graph scanning
     * 2. CVE Applicability scanning
     * @param scanManager - the scan manager to preform the scan
     * @param fileScanBundle - the bundle for the scan that contains dataNode as ProjectDependencyTreeNode instance
     * @param rootGraph - the descriptor dependencies graph
     * @param scanProgress - the progress manager for the scan
     */
    private static async createDependencyScanTask(
        scanManager: ScanManager,
        fileScanBundle: FileScanBundle,
        rootGraph: RootNode,
        scanProgress: GraphScanProgress
    ): Promise<number> {
        if (!(fileScanBundle.dataNode instanceof ProjectDependencyTreeNode)) {
            return 0;
        }
        let dependencyScanResult: DependencyScanResults = <DependencyScanResults>fileScanBundle.data;
        // Dependency graph scan task
        try {
            let issuesCount: number = await DependencyUtils.scanProjectDependencyGraph(
                scanManager,
                dependencyScanResult,
                fileScanBundle.dataNode,
                rootGraph,
                scanProgress,
                scanProgress.onProgress,
                fileScanBundle.multiScanId
            );
            if (issuesCount > 0) {
                // populate data and view
                fileScanBundle.workspaceResults.descriptorsIssues.push(dependencyScanResult);
                fileScanBundle.rootNode.addChildAndApply(fileScanBundle.dataNode);
            }
            return issuesCount;
        } catch (error) {
            if (error instanceof Error) {
                DependencyUtils.onFileScanError(error, scanManager.logManager, fileScanBundle);
            }
        } finally {
            scanProgress.onProgress();
        }

        return 0;
    }

    /**
     * Runs Xray scanning for a single descriptor and populates the data in the given node
     * @param scanManager - the scanManager that preforms the scan
     * @param dependencyIssues - the dependency scan result object that will be populated with the results
     * @param projectNode - the node that represents the descriptor in view and will be populated
     * @param descriptorGraph - the dependency graph of the descriptor
     * @param scanProgress - the progress manager for the scan
     * @param checkCanceled - the method to check if the task was canceled by the user from the notification window, will throw ScanCancellationError.
     * @returns the number of unique CVE issues found in the dependency graph scan
     */
    private static async scanProjectDependencyGraph(
        scanManager: ScanManager,
        dependencyIssues: DependencyScanResults,
        projectNode: ProjectDependencyTreeNode,
        descriptorGraph: RootNode,
        scanProgress: GraphScanProgress,
        checkCanceled: () => void,
        msi?: string
    ): Promise<number> {
        scanManager.logManager.logMessage('Scanning descriptor ' + dependencyIssues.fullPath + ' for dependencies issues', 'INFO');
        // Scan
        let startGraphScan: number = Date.now();
        dependencyIssues.dependenciesGraphScan = await scanManager
            .scanDependencyGraph(scanProgress, descriptorGraph, checkCanceled, msi)
            .finally(() => {
                scanProgress.setPercentage(100);
                dependencyIssues.graphScanTimestamp = Date.now();
            });
        if (!dependencyIssues.dependenciesGraphScan.vulnerabilities && !dependencyIssues.dependenciesGraphScan.violations) {
            return 0;
        }
        // Populate response
        dependencyIssues.impactTreeData = Object.fromEntries(
            DependencyUtils.createImpactedGraph(descriptorGraph, dependencyIssues.dependenciesGraphScan).entries()
        );
        let issuesCount: number = DependencyUtils.populateDependencyScanResults(projectNode, dependencyIssues);
        scanManager.logManager.logMessage(
            'Found ' +
                issuesCount +
                ' unique CVE issues (in ' +
                projectNode.dependenciesWithIssue.length +
                ' dependencies) for descriptor ' +
                dependencyIssues.fullPath +
                ' (elapsed ' +
                (dependencyIssues.graphScanTimestamp - startGraphScan) / 1000 +
                ' seconds)',
            'INFO'
        );
        return issuesCount;
    }

    /**
     * Handle errors that occur when scanning a specific file.
     * 1.1 If error occur during file scan and failedFile provided a failed node will be created to notify the user.
     * 1.2 If the error is FileScanError the reason attribute will be added to the label
     * 2. If cancel is reported throw the error to handle on workspace level
     * @param error - the error that occur
     * @param logger - logManager to log the information
     * @param fileScanBundle - optional file scan bundle, if exists will create failed node base on bundle
     * @returns the failed file node if the bundle exist, undefined otherwise
     */
    public static onFileScanError(error: Error, logger: LogManager, fileScanBundle?: FileScanBundle): FileTreeNode | undefined {
        let err: Error | undefined = ScanUtils.onScanError(error, logger);
        if (!err) {
            return undefined;
        }
        if (fileScanBundle) {
            logger.logMessage(
                "Workspace '" +
                    fileScanBundle.rootNode.workspace.name +
                    "' scan on file '" +
                    fileScanBundle.data.fullPath +
                    "' ended with error:\n" +
                    err,
                'ERR'
            );
            let failReason: string | undefined;
            if (error instanceof FileScanError) {
                failReason = error.reason;
            } else {
                failReason = DependencyUtils.FAIL_TO_SCAN;
            }
            fileScanBundle.data.name = failReason;
            // Populate failed data
            fileScanBundle.workspaceResults.failedFiles.push(fileScanBundle.data);
            return fileScanBundle.rootNode.addChildAndApply(FileTreeNode.createFailedScanNode(fileScanBundle.data.fullPath, failReason));
        }
        throw err;
    }

    /**
     * Creates a map for each Xray issue in a component (key= issue_id+componentId) in the response to the impact path in the given dependency graph.
     * @param descriptorGraph - the descriptor full dependency graph
     * @param response - the scan result issues and the dependency components for each of them
     * @returns map from (issue_id+componentId) to IImpactedPath for the given tree root
     */
    public static createImpactedGraph(descriptorGraph: RootNode, response: IGraphResponse): Map<string, IImpactGraph> {
        let paths: Map<string, IImpactGraph> = new Map<string, IImpactGraph>();
        let issues: IVulnerability[] = response.violations || response.vulnerabilities;
        if (!issues) {
            return paths;
        }

        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability = issues[i];
            for (let [componentId, component] of Object.entries(issue.components)) {
                const impactedPaths: IImpactGraph = descriptorGraph.createImpactedGraph(component.package_name, component.package_version);
                if (impactedPaths.root) {
                    paths.set(issue.issue_id + componentId, {
                        root: {
                            name: this.getGraphName(descriptorGraph),
                            children: impactedPaths.root?.children
                        },
                        pathsLimit: RootNode.createImpactPathLimit(impactedPaths.pathsLimit)
                    } as IImpactGraph);
                }
            }
        }
        return paths;
    }

    private static getGraphName(descriptorGraph: RootNode): string {
        return descriptorGraph.componentId.endsWith(':')
            ? descriptorGraph.componentId.slice(0, descriptorGraph.componentId.length - 1)
            : descriptorGraph.componentId;
    }

    /**
     * Populate the provided issues data to the project node (view element)
     * @param projectNode - the project node that will be populated
     * @param dependencyScanResults - the issues data that the descriptor has
     * @returns the number of issues was populated in the descriptor node
     */
    public static populateDependencyScanResults(projectNode: ProjectDependencyTreeNode, dependencyScanResults: DependencyScanResults): number {
        // Get the information from data
        let graphResponse: IGraphResponse = dependencyScanResults.dependenciesGraphScan;
        projectNode.dependencyScanTimeStamp = dependencyScanResults.graphScanTimestamp;
        if (!graphResponse.vulnerabilities && !graphResponse.violations) {
            return 0;
        }
        let impactedPaths: Map<string, IImpactGraph> = new Map<string, IImpactGraph>(Object.entries(dependencyScanResults.impactTreeData));
        let directComponents: Set<string> = this.getDirectComponents(impactedPaths);
        let issues: IVulnerability[] | IViolation[] = graphResponse.violations || graphResponse.vulnerabilities;
        // Populate issues
        for (let i: number = 0; i < issues.length; i++) {
            let issue: IVulnerability | IViolation = issues[i];
            let severity: Severity = SeverityUtils.getSeverity(issue.severity);
            // Populate the issue for each dependency component
            for (let [artifactId, component] of Object.entries(issue.components)) {
                let impactGraph: IImpactGraph | undefined = impactedPaths.get(issue.issue_id + artifactId);
                if (!impactGraph) {
                    continue;
                }
                let dependencyWithIssue: DependencyIssuesTreeNode = projectNode.addNode(
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
                    this.populateDependencyIssue(issue, dependencyWithIssue, severity, component, impactGraph);
                }
            }
        }
        // Populate licenses
        if (graphResponse.licenses) {
            graphResponse.licenses.forEach(license => {
                Object.entries(license.components)
                    .map(entry => entry[0])
                    .forEach(componentId => {
                        let dependencyWithIssue: DependencyIssuesTreeNode | undefined = projectNode.getDependencyByID(componentId);
                        dependencyWithIssue?.licenses.push({ name: license.license_key } as ILicense);
                    });
            });
        }
        // count unique issues
        let unique: Set<string> = new Set<string>();
        projectNode.dependenciesWithIssue.forEach(dependency => {
            dependency.issues.forEach(issue => {
                if (issue instanceof CveTreeNode) {
                    unique.add(issue.issueId);
                }
            });
        });
        return unique.size;
    }

    /**
     * Create an Issue node child for a dependency issues node base on a given IVulnerability
     * @param issue - the issue to create the child node from
     * @param dependencyWithIssue - the parent of this issue
     * @param severity - the severity of this issue
     * @param component - the specific component with this issue
     * @param impactedPath - the impacted path graph of this issue
     */
    private static populateDependencyIssue(
        issue: IVulnerability,
        dependencyWithIssue: DependencyIssuesTreeNode,
        severity: Severity,
        component: IComponent,
        impactedPath: IImpactGraph
    ) {
        let violationIssue: IViolation = <IViolation>issue;
        if (violationIssue && violationIssue.license_key) {
            // License violation
            dependencyWithIssue.issues.push(new LicenseIssueTreeNode(violationIssue, severity, dependencyWithIssue, impactedPath));
            return;
        }
        if (issue.cves) {
            // CVE issue
            for (let cveIssue of issue.cves) {
                dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, component, impactedPath, cveIssue));
            }
            return;
        }
        // Xray issue
        dependencyWithIssue.issues.push(new CveTreeNode(issue, severity, dependencyWithIssue, component, impactedPath));
    }

    /**
     * Convert descriptor impacted paths to a set of direct components that are impacted.
     * The first children are the direct components.
     * @param impactedPaths - the impacted path to convert
     * @returns set of direct components in the impacted path
     */
    public static getDirectComponents(impactedPaths: Map<string, IImpactGraph>): Set<string> {
        let result: Set<string> = new Set<string>();

        for (const impactedPath of impactedPaths.values()) {
            if (impactedPath.root.children) {
                for (const directPath of impactedPath.root.children) {
                    result.add(directPath.name);
                }
            }
        }

        return result;
    }

    /**
     * Find all the direct dependencies that the given dependency relates to and return their range in the code.
     * If the given dependency is direct return it's location. If it's indirect, finds the direct dependencies.
     * @param dependency - the dependency we want to get it's direct locations
     * @returns - list of ranges, one for each direct dependency
     */
    public static async getDirectDependenciesLocations(dependency: DependencyIssuesTreeNode): Promise<vscode.Range[]> {
        if (dependency.parent instanceof EnvironmentTreeNode) {
            return [];
        }
        let document: vscode.TextDocument = await vscode.workspace.openTextDocument(dependency.parent.projectFilePath);
        if (dependency.indirect) {
            // Collect direct dependencies from all the issues impact tree first children
            let ranges: vscode.Range[] = [];
            let processed: Set<string> = new Set<string>();
            for (const issue of dependency.issues) {
                let directDependencies: string[] | undefined = issue.impactGraph.root.children?.map(child => child.name);
                if (directDependencies) {
                    for (const directDependency of directDependencies) {
                        if (!processed.has(directDependency)) {
                            processed.add(directDependency);
                            ranges.push(...this.getDependencyPosition(document, dependency.type, directDependency));
                        }
                    }
                }
            }
            return ranges;
        } else {
            return this.getDependencyPosition(document, dependency.type, dependency.componentId);
        }
    }

    /**
     * Get the positions a specific dependency appears in a descriptor file
     * @param document - the descriptor document we want to search in
     * @param packageType - the type of package this descriptor has
     * @param dependencyId - the dependency id we want to search
     * @returns the list of positions in the document this dependency appears in
     */
    public static getDependencyPosition(document: vscode.TextDocument, packageType: PackageType, dependencyId: string): vscode.Range[] {
        let dependencyName: string =
            packageType == PackageType.Maven || packageType == PackageType.Nuget
                ? dependencyId
                : dependencyId.substring(0, dependencyId.lastIndexOf(':'));

        switch (packageType) {
            case PackageType.Go:
                return GoUtils.getDependencyPosition(document, dependencyName, FocusType.Dependency);
            case PackageType.Maven:
                return MavenUtils.getDependencyPosition(document, dependencyName, FocusType.Dependency);
            case PackageType.Npm:
                return NpmUtils.getDependencyPosition(document, dependencyName, FocusType.Dependency);
            case PackageType.Pnpm:
                return NpmUtils.getDependencyPosition(document, dependencyName, FocusType.Dependency);
            case PackageType.Python:
                return PypiUtils.getDependencyPosition(document, dependencyName);
            case PackageType.Yarn:
                return YarnUtils.getDependencyPosition(document, dependencyName);
            case PackageType.Nuget:
                return NugetUtils.getDependencyPosition(document, dependencyName);
            default:
                return [];
        }
    }
}
