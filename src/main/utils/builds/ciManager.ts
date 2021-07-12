import { IAqlSearchResult, IArtifact, IDetailsResponse, IGeneral, IIssue, ILicense, ISearchEntry } from 'jfrog-client-js';
import PQueue from 'p-queue';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ConnectionUtils } from '../../connect/connectionUtils';
import { BuildsNode } from '../../treeDataProviders/dependenciesTree/ciNodes/buildsTree';
import { CiTitleNode } from '../../treeDataProviders/dependenciesTree/ciNodes/ciTitleNode';
import { DependenciesTreeNode } from '../../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../treeDataProviders/treesManager';
import { BuildGeneralInfo } from '../../types/buildGeneralinfo';
import { Dependency } from '../../types/dependency';
import { GeneralInfo } from '../../types/generalInfo';
import { Issue } from '../../types/issue';
import { License } from '../../types/license';
import { Configuration } from '../configuration';
import { Translators } from '../translators';
import { BuildsScanCache, Type } from './buildsScanCache';
import { BuildsUtils } from './buildsUtils';

/**
 * Manage the filters of the components tree.
 */
export class CiManager {
    private static readonly BUILD_INFO_REPO: string = '/artifactory-build-info/';
    private static readonly DISPLAY_BUILDS_NUM: string = '100';
    public static readonly CI_CANCELLATION_ERROR: Error = new Error('Loading builds scan cancelled');

    private readonly buildsCache: BuildsScanCache;
    private root: DependenciesTreeNode;

    constructor(private _treesManager: TreesManager, root?: DependenciesTreeNode) {
        this.buildsCache = new BuildsScanCache(Configuration.getBuildsPattern(), this._treesManager.logManager);
        if (!root) {
            this.root = new DependenciesTreeNode(new GeneralInfo('', '', ['None'], '', ''), vscode.TreeItemCollapsibleState.Expanded, undefined, '');
        } else {
            this.root = root;
        }
    }

    public loadBuildTree(timestamp: string, buildName: string, buildNumber: string, parent: DependenciesTreeNode) {
        const build: any = this.buildsCache.loadBuildInfo(timestamp, buildName, buildNumber);
        if (!build) {
            throw new Error(`Couldn't find build info object in cache for '${buildName}/${buildNumber}'.`);
        }

        let bgi: BuildGeneralInfo = BuildsUtils.createBuildGeneralInfo(build, this._treesManager.logManager);
        const buildTree: BuildsNode = new BuildsNode(bgi);
        parent.addChild(buildTree);
        const modulesTree: CiTitleNode = new CiTitleNode(
            new GeneralInfo(CiTitleNode.MODULES_NODE, '', ['None'], '', 'Build Modules'),
            vscode.TreeItemCollapsibleState.Expanded,
            parent
        );
        if (BuildsUtils.isArrayExistsAndNotEmpty(build, CiTitleNode.MODULES_NODE)) {
            this.populateModulesDependencyTree(build, modulesTree);
        }

        // If the build was scanned by Xray, load Xray 'details/build' response from cache.
        let detailsResponse: IDetailsResponse | null = this.buildsCache.loadScanResults(timestamp, buildName, buildNumber);
        this.populateBuildDependencyTree(detailsResponse, modulesTree);
        modulesTree.issues = modulesTree.processTreeIssues();
    }

    public populateModulesDependencyTree(build: any, modulesRoot: DependenciesTreeNode) {
        for (const module of build.modules) {
            const artifactId: string = BuildsUtils.getArtifactIdFromCompId(module.id);
            const version: string = BuildsUtils.getVersionFromCompId(module.id);
            const moduleGeneralInfo: GeneralInfo = new GeneralInfo(artifactId, version, ['None'], '', module.type);
            const moduleNode: CiTitleNode = new CiTitleNode(moduleGeneralInfo, vscode.TreeItemCollapsibleState.Collapsed, undefined);

            // Populate artifacts
            if (BuildsUtils.isArrayExistsAndNotEmpty(module, CiTitleNode.ARTIFACTS_NODE)) {
                const artifactsNode: DependenciesTreeNode = BuildsUtils.createArtifactsNode();
                moduleNode.addChild(artifactsNode);
                this.populateArtifacts(artifactsNode, module);
            }

            // Populate dependencies
            if (BuildsUtils.isArrayExistsAndNotEmpty(module, CiTitleNode.DEPENDENCIES_NODE)) {
                const dependenciesNode: DependenciesTreeNode = BuildsUtils.createDependenciesNode();
                moduleNode.addChild(dependenciesNode);
                this.populateDependencies(dependenciesNode, module);
            }

            if (moduleNode.children.length > 0) {
                modulesRoot.addChild(moduleNode);
            }
        }
    }

    public populateArtifacts(artifactsNode: DependenciesTreeNode, module: any): void {
        for (const artifact of module.artifacts) {
            const artifactGeneralInfo: GeneralInfo = new GeneralInfo(
                BuildsUtils.getArtifactIdFromCompId(artifact.name),
                BuildsUtils.getVersionFromCompId(artifact.name),
                ['None'],
                '',
                artifact.type,
                artifact.sha1,
                artifact.sha256
            );
            const artifactNode: DependenciesTreeNode = new DependenciesTreeNode(
                artifactGeneralInfo,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                ''
            );
            artifactsNode.addChild(artifactNode);
        }
    }

    public populateDependencies(dependenciesNode: DependenciesTreeNode, module: any): void {
        let directDependencies: Set<Dependency> = new Set<Dependency>();
        let parentToChildren: Map<string, Dependency[]> = new Map<string, Dependency[]>();
        for (const dependency of module.dependencies) {
            let requestedBy: string[][] = dependency.requestedBy;
            if (!(BuildsUtils.isArrayExistsAndNotEmpty(module, CiTitleNode.DEPENDENCIES_NODE) && requestedBy && !!requestedBy[0].length)) {
                // If no requested by, add dependency and exit.
                directDependencies.add(dependency);
                continue;
            }

            for (const parent of requestedBy) {
                let directParent: string = parent[0];
                if (!requestedBy[0][0] || requestedBy[0][0] === module.id) {
                    directDependencies.add(dependency);
                } else {
                    let children: Dependency[] = parentToChildren.get(directParent) || [];
                    children.push(dependency);
                    parentToChildren.set(directParent, children);
                }
            }
        }

        for (const directDependency of directDependencies) {
            dependenciesNode.addChild(this.populateTransitiveDependencies(directDependency, parentToChildren));
        }
    }

    private populateTransitiveDependencies(dependency: Dependency, parentToChildren: Map<string, Dependency[]>): DependenciesTreeNode {
        let dependencyGeneralInfo: GeneralInfo = new GeneralInfo(
            BuildsUtils.getArtifactIdFromCompId(dependency.id),
            BuildsUtils.getVersionFromCompId(dependency.id),
            dependency.scopes || ['None'],
            '',
            dependency.type,
            dependency.sha1,
            dependency.sha256
        );
        let dependencies: Dependency[] = parentToChildren.get(dependency.id) || [];
        let dependencyTree: DependenciesTreeNode = new DependenciesTreeNode(
            dependencyGeneralInfo,
            dependencies.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            undefined,
            ''
        );

        for (const child of dependencies) {
            dependencyTree.addChild(this.populateTransitiveDependencies(child, parentToChildren));
        }
        return dependencyTree;
    }

    public populateBuildDependencyTree(response: IDetailsResponse | null, modulesTree: DependenciesTreeNode): void {
        if (!response) {
            // If no response from Xray, the dependency tree components status is unknown.
            // Populate all nodes with dummy unknown level issues to show the unknown icon in tree nodes.
            this.populateTreeWithUnknownIssues(modulesTree);
            return;
        }

        // Component to issues and licenses mapping
        let componentIssuesAndLicenses: Map<string, IssuesAndLicensesPair> = new Map();
        // Sha1 to Sha256 mapping
        let sha1ToSha256: Map<string, string> = new Map();
        // Component to Xray Artifact mapping
        let sha1ToComponent: Map<string, IArtifact> = new Map();

        // Populate the above mappings. We will use the information to populate the dependency tree efficiently.
        let components: IArtifact[] = response.components;
        for (const component of components) {
            let general: IGeneral = component.general;
            sha1ToComponent.set(general.sha1, component);
            sha1ToSha256.set(general.sha1, general.sha256);
            for (const parentSha256 of general.parent_sha256) {
                let issuesAndLicenses: IssuesAndLicensesPair | undefined = componentIssuesAndLicenses.get(parentSha256);
                if (!issuesAndLicenses) {
                    issuesAndLicenses = new IssuesAndLicensesPair();
                    componentIssuesAndLicenses.set(parentSha256, issuesAndLicenses);
                }
                if (component.issues.length > 0) {
                    for (const issue of component.issues) {
                        issuesAndLicenses._issues.add(issue);
                    }
                }
                if (component.licenses.length > 0) {
                    for (const license of component.licenses) {
                        issuesAndLicenses._licenses.add(license);
                    }
                }
            }
        }

        // Populate the build modules
        for (const module of modulesTree.children) {
            for (const artifactsOrDep of module.children) {
                const isArtifactNode: boolean = artifactsOrDep.generalInfo.artifactId === CiTitleNode.ARTIFACTS_NODE;
                for (const child of artifactsOrDep.children) {
                    this.populateComponents(child, sha1ToComponent, sha1ToSha256, componentIssuesAndLicenses, isArtifactNode);
                }
            }
        }
    }

    public populateComponents(
        node: DependenciesTreeNode,
        sha1ToComponent: Map<string, IArtifact>,
        sha1ToSha256: Map<string, string>,
        componentIssuesAndLicenses: Map<string, IssuesAndLicensesPair>,
        isArtifact: boolean
    ): void {
        for (const child of node.children) {
            this.populateComponents(child, sha1ToComponent, sha1ToSha256, componentIssuesAndLicenses, isArtifact);
        }
        let sha1: string | undefined = node.generalInfo.sha1;
        if (!sha1) {
            // Sha1 does not exist in node
            return;
        }
        let artifact: IArtifact | undefined = sha1ToComponent.get(sha1);
        if (!artifact) {
            // Artifact not found in Xray scan
            this.addUnknownLicenseToMissingNode(node);
            return;
        }
        if (artifact.issues.length > 0) {
            for (const issue of artifact.issues) {
                node.issues.add(Translators.toIssue(issue));
            }
        }
        if (artifact.licenses.length > 0) {
            for (const license of artifact.licenses) {
                node.licenses.add(Translators.toLicense(license));
            }
        }
        if (!isArtifact) {
            return;
        }
        let sha256: string = sha1ToSha256.get(sha1)!;
        let issuesAndLicenses: IssuesAndLicensesPair | undefined = componentIssuesAndLicenses.get(sha256);
        if (issuesAndLicenses) {
            issuesAndLicenses._issues.forEach(issue => {
                node.issues.add(Translators.toIssue(issue));
            });
            issuesAndLicenses._licenses.forEach(license => {
                node.licenses.add(Translators.toLicense(license));
            });
        }
    }

    private addUnknownLicenseToMissingNode(node: DependenciesTreeNode) {
        node.licenses.add(new License([], [], License.UNKNOWN_LICENSE_FULL_NAME, License.UNKNOWN_LICENSE));
    }

    public populateTreeWithUnknownIssues(modulesTree: DependenciesTreeNode) {
        for (const node of modulesTree.children) {
            this.populateTreeWithUnknownIssues(node);
        }
        modulesTree.issues.add(Issue.MISSING_COMPONENT);
        this.addUnknownLicenseToMissingNode(modulesTree);
    }

    public async refreshBuilds(progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void): Promise<void> {
        const pattern: string = Configuration.getBuildsPattern();
        try {
            await this.buildCiTree(pattern, progress, checkCanceled);
        } catch (error) {
            vscode.window.showErrorMessage('Could not build CI tree.', <vscode.MessageOptions>{ modal: false });
            this._treesManager.logManager.logMessage(error.message, 'ERR', true);
        }
    }

    private async buildCiTree(
        buildsPattern: string,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void
    ): Promise<void> {
        try {
            const searchResult: IAqlSearchResult = await this._treesManager.connectionManager.searchArtifactsByAql(
                CiManager.createAqlForBuildArtifacts(buildsPattern)
            );
            if (!searchResult) {
                throw new Error('Failed searching for builds in Artifactory');
            }
            if (!searchResult.results.length) {
                return;
            }
            progress.report({ message: `${searchResult.results.length} builds` });

            const producerQueue: PQueue = new PQueue({ concurrency: 1 });
            const consumerQueue: PQueue = new PQueue({ concurrency: 1 });
            let xraySupported: boolean = await ConnectionUtils.testXrayVersionForCi(
                this._treesManager.connectionManager.createJfrogClient(),
                this._treesManager.logManager
            );
            for (const entry of searchResult.results) {
                checkCanceled();
                producerQueue.add(() =>
                    this.getBuildInfoAndProduce(
                        entry,
                        consumerQueue,
                        this.buildsCache,
                        progress,
                        checkCanceled,
                        searchResult.results.length,
                        xraySupported
                    )
                );
            }
            await producerQueue.onEmpty();
            await consumerQueue.onEmpty();
        } catch (error) {
            if (error.message === CiManager.CI_CANCELLATION_ERROR.message) {
                // If it's not a cancellation error, throw it up
                throw error;
            }
            vscode.window.showErrorMessage(error.message);
        }
    }

    private async getBuildInfoAndProduce(
        searchEntry: ISearchEntry,
        consumerQueue: PQueue,
        buildsCache: BuildsScanCache,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void,
        buildsNum: number,
        xraySupported: boolean
    ): Promise<void> {
        try {
            checkCanceled();
            const buildName: string = decodeURIComponent(searchEntry.path);
            const split: string[] = searchEntry.name.split('-');
            if (split.length !== 2) {
                throw new Error('unexpected build artifact name');
            }
            const buildNumber: string = split[0];
            const timestamp: string = split[1];

            let build: any = buildsCache.loadBuildInfo(timestamp, buildName, buildNumber) || (await this.downloadBuildInfo(searchEntry, buildsCache));
            let buildGeneralInfo: BuildGeneralInfo = BuildsUtils.createBuildGeneralInfo(build, this._treesManager.logManager);
            if (!build) {
                progress.report({ message: `${buildsNum} builds`, increment: 100 / (buildsNum * 2) });
                return;
            }
            this.addResults(buildGeneralInfo);
            consumerQueue.add(() => this.handleXrayBuildDetails(buildGeneralInfo, buildsCache, progress, checkCanceled, buildsNum, xraySupported));
        } catch (error) {
            if (error.message === CiManager.CI_CANCELLATION_ERROR.message) {
                // If it's not a cancellation error, throw it up
                throw error;
            }
            vscode.window.showErrorMessage('Could not download build info.', <vscode.MessageOptions>{ modal: false });
            this._treesManager.logManager.logMessage(error.message, 'ERR', true);
        } finally {
            progress.report({ message: `${buildsNum} builds`, increment: 100 / (buildsNum * 2) });
        }
    }

    private async downloadBuildInfo(searchEntry: ISearchEntry, buildsCache: BuildsScanCache): Promise<any> {
        const artifactPath: string = CiManager.BUILD_INFO_REPO + searchEntry.path + '/' + searchEntry.name;
        try {
            const build: any = await this._treesManager.connectionManager.downloadArtifact(artifactPath);
            const timestamp: string = Date.parse(build.started).toString();
            buildsCache.save(JSON.stringify(build), timestamp, build.name, build.number, Type.BUILD_INFO);
            return build;
        } catch (error) {
            this._treesManager.logManager.logMessage(
                `Could not get build details from Artifactory for build: '${searchEntry.path}/${searchEntry.name}': ${error}`,
                'ERR',
                true
            );
        }
    }

    private async downloadBuildDetails(buildGeneralInfo: BuildGeneralInfo, buildsCache: BuildsScanCache): Promise<void> {
        let timestamp: string = buildGeneralInfo.startedTimestamp;
        let buildName: string = buildGeneralInfo.artifactId;
        let buildNumber: string = buildGeneralInfo.version;
        const detailsResponse: IDetailsResponse = await this._treesManager.connectionManager.downloadBuildDetails(buildName, buildNumber);
        if (!detailsResponse.is_scan_completed || !!detailsResponse.error_details || !detailsResponse.components) {
            if (!!detailsResponse.error_details) {
                this._treesManager.logManager.logMessage(
                    `Could not get build details from Xray for build: '${buildName}/${buildNumber}': ${detailsResponse.error_details.error_message}`,
                    'ERR',
                    true
                );
            }
            return;
        }
        buildsCache.save(JSON.stringify(detailsResponse), timestamp, buildName, buildNumber, Type.BUILD_SCAN_RESULTS);
    }

    private addResults(bgi: BuildGeneralInfo): void {
        const buildTree: BuildsNode = new BuildsNode(bgi);
        this.root.addChild(buildTree);
    }

    private async handleXrayBuildDetails(
        buildGeneralInfo: BuildGeneralInfo,
        buildsCache: BuildsScanCache,
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void,
        buildsNum: number,
        xraySupported: boolean
    ): Promise<void> {
        try {
            if (!xraySupported) {
                return;
            }
            const buildName: string = buildGeneralInfo.artifactId;
            const buildNumber: string = buildGeneralInfo.version;
            const timestamp: string = buildGeneralInfo.startedTimestamp;
            checkCanceled();
            if (!buildsCache.loadScanResults(timestamp, buildName, buildNumber)) {
                await this.downloadBuildDetails(buildGeneralInfo, buildsCache);
            }
        } catch (error) {
            if (error.message === CiManager.CI_CANCELLATION_ERROR.message) {
                // If it's not a cancellation error, throw it up
                throw error;
            }
            this._treesManager.logManager.logMessage('Could not get build details from xray: ' + error.message, 'ERR', true);
        } finally {
            progress.report({ message: `${buildsNum} builds`, increment: 100 / (buildsNum * 2) });
        }
    }

    private static createAqlForBuildArtifacts(buildsPattern: string): string {
        let encodedBuildPattern: string = encodeURIComponent(buildsPattern);
        // The following is a workaround, since Artifactory does not yet support '%' in AQL
        encodedBuildPattern = encodedBuildPattern.replace(/%/g, '?');
        return (
            `items.find({` +
            `\"repo\":\"artifactory-build-info\",` +
            `\"path\":{\"$match\":\"${encodedBuildPattern}\"}})` +
            `.include(\"name\",\"repo\",\"path\",\"created\")` +
            `.sort({\"$desc\":[\"created\"]})` +
            `.limit(${CiManager.DISPLAY_BUILDS_NUM})`
        );
    }
}

class IssuesAndLicensesPair {
    public _issues: Collections.Set<IIssue> = new Collections.Set<IIssue>();
    public _licenses: Collections.Set<ILicense> = new Collections.Set<ILicense>();
}
