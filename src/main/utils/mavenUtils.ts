import * as exec from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { ContextKeys, FocusType } from '../constants/contextKeys';
import { LogManager } from '../log/logManager';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/mavenTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ProjectDetails } from '../types/projectDetails';
import { PomTree } from './pomTree';
import { ScanUtils } from './scanUtils';

export class MavenUtils {
    public static readonly DOCUMENT_SELECTOR: any = { scheme: 'file', pattern: '**/pom.xml' };
    public static readonly MAVEN_GAV_READER: string = path.join(ScanUtils.RESOURCES_DIR, 'maven-gav-reader.jar');
    private static mavenGavReaderInstalled: boolean;
    static pathToNode: Map<string, MavenTreeNode> = new Map<string, MavenTreeNode>();

    /**
     * Get pom.xml file and return the position of '<dependencies>' section.
     * @param document - pom.xml file
     */
    public static getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
        let res: vscode.Position[] = [];
        let mavenPomContent: string = document.getText();
        let dependenciesMatch: RegExpMatchArray | null = mavenPomContent.match('<dependencies>');
        if (!dependenciesMatch) {
            return res;
        }
        res.push(document.positionAt(<number>dependenciesMatch.index));
        res.push(new vscode.Position(res[0].line, res[0].character + dependenciesMatch[0].length));
        return res;
    }

    /**
     * Get pom.xml file and dependencies tree node. return the position of the dependency in the pom.xml file.
     * @param document             - pom.xml file
     * @param dependenciesTreeNode - dependencies tree node
     */
    public static getDependencyPosition(document: vscode.TextDocument, dependencyId: string | undefined, focusType: FocusType): vscode.Range[] {
        if (!dependencyId) {
            return [];
        }
        let res: vscode.Range[] = [];
        let pomXmlContent: string = document.getText();
        let [groupId, artifactId, version] = MavenUtils.getGavArrayFromId(dependencyId);
        let dependencyTag: string = MavenUtils.getDependencyTag(pomXmlContent, groupId, artifactId);
        if (dependencyTag) {
            let startIndex: vscode.Position = document.positionAt(pomXmlContent.indexOf(dependencyTag));
            let arr: string[] = dependencyTag.split(/\r?\n/).filter(line => line.trim() !== '');
            for (let i: number = 0; i < arr.length; i++) {
                let depInfo: string = arr[i].trim().toLowerCase();
                if (this.isDependencyMatch(groupId, artifactId, version, depInfo, focusType)) {
                    res.push(
                        new vscode.Range(
                            new vscode.Position(startIndex.line + i, arr[i].indexOf('<')),
                            new vscode.Position(startIndex.line + i, arr[i].length)
                        )
                    );
                }
            }
            return res;
        }
        return [];
    }

    public static isDependencyMatch(groupId: any, artifactId: any, version: any, depInfo: string, focusType: FocusType): boolean {
        switch (focusType) {
            case FocusType.Dependency:
                return (
                    depInfo === '<groupid>' + groupId + '</groupid>' ||
                    depInfo === '<artifactid>' + artifactId + '</artifactid>' ||
                    depInfo === '<version>' + version + '</version>'
                );
            case FocusType.DependencyVersion:
                return depInfo === '<version>' + version + '</version>';
        }
    }

    /**
     * Get <dependency>...</dependency> tag from the pom.xml.
     * @param pomXmlContent - The pom.xml content
     * @param groupId - The dependency's group ID
     * @param artifactId  - The dependency's artifact ID
     */
    public static getDependencyTag(pomXmlContent: string, groupId: string, artifactId: string): string {
        let groupIdRegex: RegExp = new RegExp(`<groupId>\\s*${groupId}\\s*</groupId>`, 'gi');
        let artifactIdRegex: RegExp = new RegExp(`<artifactId>\\s*${artifactId}\\s*</artifactId>`, 'gi');
        let dependencyMatch: string[] | undefined = pomXmlContent
            .match(/<dependency>(.|\s)*?<\/dependency>/gi)
            ?.filter(group => group.match(groupIdRegex) && group.match(artifactIdRegex));
        if (dependencyMatch && dependencyMatch.length > 0) {
            return dependencyMatch[0];
        }
        return '';
    }

    /**
     * Get an array of [groupId, artifactId, version] from dependencies tree node.
     * @param dependenciesTreeNode - The dependencies tree node
     */
    public static getGavArrayFromId(dependencyId: string): string[] {
        return dependencyId.toLowerCase().split(':');
    }

    /**
     * Get an array of [groupId, artifactId, version] from dependencies tree node.
     * @param dependency - The dependencies tree node
     */
    public static getGavArray(dependency: DependencyIssuesTreeNode): string[] {
        return dependency.componentId.toLowerCase().split(':');
    }

    /**
     * @return [POM-GAV, Parent-GAV]. If not found, return empty strings.
     */
    public static getPomDetails(pathToPomXml: string, logManager: LogManager, pomIdCache: Map<string, [string, string]>): [string, string] {
        let gav: [string, string] | undefined = pomIdCache.get(pathToPomXml);
        if (!!gav) {
            return gav;
        }
        try {
            let mvnGavRes: string = ScanUtils.executeCmd('mvn com.jfrog.ide:maven-gav-reader:gav -q', path.dirname(pathToPomXml));
            mvnGavRes
                .toString()
                .split(/\r\n|\r|\n/)
                .filter(mvnGav => !!mvnGav)
                .map(mvnGav => mvnGav.replace(/\\/g, '\\\\')) // Escape '\' character
                .forEach(mvnGav => {
                    let mvnGavJson: any = JSON.parse(mvnGav);
                    let pomXmlPath: string = mvnGavJson['pomPath'];
                    let gav: string = mvnGavJson['gav'];
                    let parentGav: string = mvnGavJson['parentGav'];
                    pomIdCache.set(pomXmlPath, [gav, parentGav]);
                });
            return pomIdCache.get(pathToPomXml) || ['', ''];
        } catch (error) {
            logManager.logMessage(
                'Could not get parse pom.xml GAV.\n' + 'Try to install it by running "mvn clean install" from ' + path.resolve(pathToPomXml) ||
                    pathToPomXml + '.',
                'ERR'
            );
            logManager.logMessage((<any>error).stdout?.toString().replace(/(\[.*?\])/g, ''), 'ERR');
        }
        return ['', ''];
    }

    /**
     * @param pomXmls          - Paths to pom.xml files
     * @param projectDetails   - Maven project details which includes all dependencies GAV. We'll use this set later on, while scanning the packages with Xray.
     * @param treesManager     - The trees manager
     * @param root             - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createDependenciesTrees(
        pomXmls: vscode.Uri[] | undefined,
        projectDetails: ProjectDetails[],
        treesManager: TreesManager,
        root: DependenciesTreeNode,
        checkCanceled: () => void
    ): Promise<void> {
        if (!pomXmls) {
            treesManager.logManager.logMessage('No pom.xml files found in workspaces.', 'DEBUG');
            return;
        }
        treesManager.logManager.logMessage('pom.xml files to scan: [' + pomXmls.toString() + ']', 'DEBUG');
        if (!MavenUtils.verifyMavenInstalled()) {
            treesManager.logManager.logError(new Error('Could not scan Maven project dependencies, because "mvn" is not in the PATH.'), true);
            return;
        }
        checkCanceled();
        treesManager.logManager.logMessage('Generating Maven Dependency Tree', 'INFO');
        let prototypeTree: PomTree[] = MavenUtils.buildPrototypePomTree(pomXmls, treesManager.logManager);
        for (let ProjectTree of prototypeTree) {
            checkCanceled();
            try {
                treesManager.logManager.logMessage('Analyzing pom.xml at ' + ProjectTree.pomPath, 'INFO');
                ProjectTree.runMavenDependencyTree();
                let mavenRoot: MavenTreeNode = new MavenTreeNode(ProjectTree.pomPath, treesManager, root);
                const mavenProjectsDetails: ProjectDetails[] = await mavenRoot.refreshDependencies(ProjectTree);
                if (mavenRoot.children.length === 0) {
                    root.children.splice(root.children.indexOf(mavenRoot), 1);
                } else {
                    projectDetails.push(...mavenProjectsDetails);
                    this.updateContextValue(mavenRoot);
                }
            } catch (error) {
                treesManager.logManager.logMessageAndToastErr(
                    'Could not get dependencies tree from pom.xml.\n' +
                        'Try to install it by running "mvn clean install" from ' +
                        ProjectTree.pomPath +
                        '.',
                    'ERR'
                );
                treesManager.logManager.logMessage((<any>error).stdout?.toString().replace(/(\[.*?\])/g, ''), 'ERR');
            }
        }
    }

    /**
     * The value in 'contextValue' is read in the pom.xml to decide what to show components in the right click menu.
     * if 'node' has not related pom.xml in project dir, disable right click 'Show in project descriptor'.
     * If 'node' has a related pom.xml file and it is also a transitive dependency, enable 'Exclude dependency'.
     * Recursively update all node's children as well.
     * @param node - Tree node.
     */
    public static async updateContextValue(node: DependenciesTreeNode, dependenciesMatch?: RegExpMatchArray | null, parentCanReachPom?: boolean) {
        let nodeCanReachPom: boolean = this.isPomReachable(node, dependenciesMatch, parentCanReachPom);
        if (!nodeCanReachPom) {
            // Disable right click menu on the dependency
            node.contextValue?.replace(ContextKeys.SHOW_IN_PROJECT_DESC_ENABLED, '');
        } else if (!(node.parent instanceof MavenTreeNode) && node.parent?.label) {
            // Enable 'Exclude dependency' and 'Show in project descriptor' in right click menu on the dependency
            node.contextValue += ContextKeys.EXCLUDE_DEPENDENCY_ENABLED;
        }
        // Prepare the closer pom.xml for the children.
        if (node instanceof MavenTreeNode) {
            const text: string | undefined = (await MavenUtils.openPomXml(node))?.getText();
            dependenciesMatch = text?.match(/<dependency>(.|\s)*?<\/dependency>/gi);
        }
        node.children.forEach(async c => await this.updateContextValue(c, dependenciesMatch, nodeCanReachPom));
    }

    /**
     * Return true if the dependency or an ancestor of the dependency appears in the pom.
     * Return false if the pom is not in the project or if the dependency is defined by pom properties.
     * @param node - The dependency node
     * @param pomDependencies - The <dependency>...</dependency> tag in pom
     * @param parentCanReachPom - True if one of the ancestors is pom reachable
     */
    private static isPomReachable(node: DependenciesTreeNode, pomDependencies?: RegExpMatchArray | null, parentCanReachPom?: boolean): boolean {
        // MavenTreeNode contains the path to Pom.xml.
        if (node instanceof MavenTreeNode) {
            return true;
        }
        if (this.isNodeInPom(node, pomDependencies)) {
            return true;
        }
        return !this.isNodeDirectDependency(node) && !!parentCanReachPom;
    }

    private static isNodeDirectDependency(node: DependenciesTreeNode) {
        return node.parent instanceof MavenTreeNode;
    }

    private static isNodeInPom(node: DependenciesTreeNode, pomDependencies?: RegExpMatchArray | null) {
        // Pom without dependencies.
        if (!pomDependencies || pomDependencies.length === 0) {
            return false;
        }
        const [groupId, artifactId] = node.generalInfo
            .getComponentId()
            .toLowerCase()
            .split(':');
        if (groupId === '' || artifactId === '') {
            return false;
        }
        let dependencyMatch: string[] | undefined = pomDependencies?.filter(group => group.includes(groupId) && group.includes(artifactId));
        return !!dependencyMatch && dependencyMatch.length > 0;
    }

    /**
     * Open 'dependenciesTreeNode' pom.xml. If not found, search in upper tree level (recursive).
     * @param dependenciesTreeNode - Tree node.
     */
    public static async openPomXml(dependenciesTreeNode: DependenciesTreeNode): Promise<vscode.TextDocument | undefined> {
        // Search for the nearest pom.xml (MavenTreeNode) which matches the fs path of the input node
        while (dependenciesTreeNode.parent && dependenciesTreeNode instanceof MavenTreeNode === false) {
            dependenciesTreeNode = dependenciesTreeNode.parent;
        }
        let fsPath: string | undefined = (<MavenTreeNode>dependenciesTreeNode).workspaceFolder;
        if (!fsPath) {
            return;
        }
        let openPath: vscode.Uri = vscode.Uri.file(path.join(fsPath, 'pom.xml'));
        if (!openPath) {
            return;
        }
        return await vscode.workspace.openTextDocument(openPath);
    }

    /**
     * for each pom:
     * 1. get the pomGav(groupId,artifactId,version)
     * 2. search pomGav from step 1 in pomTree
     *  2.1 if found remove from tree and otherwise create new node with pomGav
     * 3. update the path/parent of node from step 3
     * 4. try to add the node to its parent's children otherwise add it to the root of the tree.
     * @param pomArray list of all pom.xml uri inside root dir
     * @param logManager the log manager
     */
    public static buildPrototypePomTree(pomArray: vscode.Uri[], logManager: LogManager): PomTree[] {
        let prototypeTree: PomTree[] = [];
        let pomIdCache: Map<string, [string, string]> = new Map<string, [string, string]>();
        if (!MavenUtils.mavenGavReaderInstalled) {
            MavenUtils.installMavenGavReader();
        }
        pomArray
            .sort((pomPath1, pomPath2) => pomPath1.fsPath.length - pomPath2.fsPath.length)
            .forEach(pom => {
                const [pomGav, parentGav]: string[] = MavenUtils.getPomDetails(pom.fsPath, logManager, pomIdCache);
                if (!!pomGav) {
                    let index: number = MavenUtils.searchPomGav(prototypeTree, pomGav);
                    let currNode: PomTree;
                    if (index > -1) {
                        currNode = prototypeTree[index];
                        prototypeTree.splice(index, 1);
                    } else {
                        currNode = new PomTree(pomGav);
                    }
                    currNode.pomPath = pom.fsPath;
                    currNode.parentGav = parentGav;
                    MavenUtils.addPrototypeNode(prototypeTree, currNode);
                }
            });

        // Remove the root node if not found in the project directories
        for (let i: number = 0; i < prototypeTree.length; i++) {
            if (!prototypeTree[i].pomPath) {
                const oldRoot: PomTree[] = prototypeTree.splice(i, 1);
                prototypeTree.push(...oldRoot[0].children);
            }
        }
        return prototypeTree;
    }

    /**
     * If the node have parent do:
     * 1. check if the parent already in the tree,
     *  1.1 if its add to its child
     *  1.2 else create the parent and add the parent to the array
     * 2.otherwise add the node to the array
     * @param pomArray - Pom array
     * @param node - Node to be added
     */
    static addPrototypeNode(pomArray: PomTree[], node: PomTree) {
        if (!!node.parentGav) {
            const parentNode: PomTree | undefined = MavenUtils.getPrototypeNode(pomArray, node.parentGav);
            if (!!parentNode) {
                parentNode.addChild(node);
            } else {
                const parentPom: PomTree = new PomTree(node.parentGav);
                parentPom.addChild(node);
                pomArray.push(parentPom);
            }
        } else {
            pomArray.push(node);
        }
    }

    public static verifyMavenInstalled(): boolean {
        try {
            exec.execSync('mvn -version');
        } catch (error) {
            return false;
        }
        return true;
    }

    public static getPrototypeNode(prototypeTreeArray: PomTree[], pomGav: string): PomTree | undefined {
        for (const prototypeTree of prototypeTreeArray) {
            const node: PomTree | undefined = prototypeTree.deepSearch(pomGav);
            if (node) {
                return node;
            }
        }
        return;
    }

    public static searchPomGav(pomTreeArray: PomTree[], pomGav: string): number {
        return pomTreeArray.findIndex(pomTree => pomTree.pomGav === pomGav);
    }

    /**
     * @param rawDependency Raw dependency text
     */
    public static getProjectInfo(rawDependency: string): [string, string, string, string] {
        return MavenUtils.getDependencyInfo(rawDependency.replace(/\s/g, '') + ':dummyScope');
    }

    /**
     * @param rawDependency - e.g. "|  |  +- javax.mail:mail:jar:1.4:compile"
     * @returns [groupId,ArtifactId,version]
     */
    public static getDependencyInfo(rawDependency: string): [string, string, string, string] {
        let result: string[] = rawDependency.split(':');
        // Skip none alphanumeric characters
        let startIndex: number = result[0].search(/\w/);
        return [result[0].slice(startIndex), result[1], result[result.length - 2], result[result.length - 1].split(' ')[0]];
    }

    // 'mvn dependency:tree' duplicate the parent dependencies to its child.
    // this method filter out parent dependencies from child dependency
    public static filterParentDependencies(childDependencies: string[], parentDeps?: string[]): string[] | undefined {
        if (parentDeps) {
            const rawParentDep: string = parentDeps.join(' ');
            return childDependencies.filter(childDep => {
                const index: number = childDep.search(/\w/);
                const regex: RegExp = new RegExp(`^.*${childDep.slice(index)}.*$`, 'mg');
                return !!rawParentDep.match(regex) === false;
            });
        }
        return;
    }

    /**
     * Install Maven GAV Reader to maven local repository.
     */
    public static installMavenGavReader() {
        ScanUtils.executeCmd('mvn org.apache.maven.plugins:maven-install-plugin:2.5.2:install-file -Dfile=' + MavenUtils.MAVEN_GAV_READER);
        MavenUtils.mavenGavReaderInstalled = true;
    }
}
