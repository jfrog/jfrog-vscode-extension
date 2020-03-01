import * as vscode from 'vscode';
import * as Collections from 'typescript-collections';
import * as path from 'path';
import fs from 'fs';
import * as exec from 'child_process';
import parser from 'fast-xml-parser';
import { ScanUtils } from './scanUtils';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ComponentDetails } from 'xray-client-js';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/mavenTreeNode';
import { PomTree } from './pomTree';

export class MavenUtils {
    public static readonly DOCUMENT_SELECTOR: any = { scheme: 'file', pattern: '**/pom.xml' };
    public static readonly PKG_TYPE: string = 'maven';
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
    public static getDependencyPos(document: vscode.TextDocument, dependenciesTreeNode: DependenciesTreeNode | undefined): vscode.Position[] {
        if (!dependenciesTreeNode) {
            return [];
        }
        let res: vscode.Position[] = [];
        let pomXmlContent: string = document.getText();
        let [groupId, artifactId, version] = dependenciesTreeNode.generalInfo
            .getComponentId()
            .toLowerCase()
            .split(':');
        let dependencyMatch: string[] | undefined = pomXmlContent
            .match(/<dependency>(.|\s)*?<\/dependency>/gi)
            ?.filter(group => group.includes(groupId) && group.includes(artifactId));
        if (dependencyMatch && dependencyMatch.length > 0) {
            let startIndex: vscode.Position = document.positionAt(pomXmlContent.indexOf(dependencyMatch[0]));
            let arr: string[] = dependencyMatch[0].split(/\r?\n/).filter(line => line.trim() !== '');
            for (let i: number = 0; i < arr.length; i++) {
                let depInfo: string = arr[i].trim().toLowerCase();
                if (
                    depInfo === '<groupid>' + groupId + '</groupid>' ||
                    depInfo === '<artifactid>' + artifactId + '</artifactid>' ||
                    depInfo === '<version>' + version + '</version>'
                ) {
                    res.push(new vscode.Position(startIndex.line + i, arr[i].indexOf('<')));
                    res.push(new vscode.Position(startIndex.line + i, arr[i].length));
                }
            }
            return res;
        }
        if (!(dependenciesTreeNode instanceof MavenTreeNode)) {
            return MavenUtils.getDependencyPos(document, dependenciesTreeNode.parent);
        }
        return [];
    }

    /**
     * Find pom.xml files in workspaces.
     * @param workspaceFolders - Base workspace folders to search
     * @param progress         - progress bar
     */
    public static async locatePomXmls(
        workspaceFolders: vscode.WorkspaceFolder[],
        progress: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<vscode.Uri[]> {
        progress.report({ message: 'Locating pom.xml files in workspace ' });
        let pomXmls: Collections.Set<vscode.Uri> = new Collections.Set();
        for (let workspace of workspaceFolders) {
            progress.report({ message: 'Locating pom.xml files in workspace ' + workspace.name });
            let wsPomXmls: vscode.Uri[] = await vscode.workspace.findFiles(
                { base: workspace.uri.fsPath, pattern: '**/pom.xml' },
                ScanUtils.getScanExcludePattern(workspace)
            );
            wsPomXmls.forEach(pomXml => pomXmls.add(pomXml));
        }
        let result: vscode.Uri[] = pomXmls.toArray();
        // We need to sort so on each time and on each OS we will get the same order
        return Promise.resolve(result.length > 1 ? result.sort((a: vscode.Uri, b: vscode.Uri) => a.fsPath.localeCompare(b.fsPath)) : result);
    }

    /**
     * return pom Gav and parent GAV.if not found, empty string will be returned
     */
    public static getPomDetails(pathToPomXml: string, treesManager: TreesManager): [string, string] {
        try {
            const rawText: string = fs.readFileSync(pathToPomXml, 'utf8').toString();
            let pomXmlData: any = parser.parse(rawText).project;
            let groupId: string = pomXmlData.groupId?.toString();
            if (!groupId || groupId.includes('$')) {
                groupId = this.executeMavenCmd(
                    `mvn org.apache.maven.plugins:maven-help-plugin:3.2.0:evaluate  -Dexpression=project.groupId -q -DforceStdout`,
                    path.dirname(pathToPomXml)
                );
            }
            let artifactId: string = pomXmlData.artifactId?.toString();
            if (!artifactId || artifactId.includes('$')) {
                artifactId = this.executeMavenCmd(
                    `mvn org.apache.maven.plugins:maven-help-plugin:3.2.0:evaluate -Dexpression=project.artifactId -q -DforceStdout`,
                    path.dirname(pathToPomXml)
                );
            }
            let version: string = pomXmlData.version?.toString();
            if (!version || version.includes('$')) {
                version = this.executeMavenCmd(
                    `mvn org.apache.maven.plugins:maven-help-plugin:3.2.0:evaluate -Dexpression=project.version -q -DforceStdout`,
                    path.dirname(pathToPomXml)
                );
            }
            let parentArtifactId: string = pomXmlData.parent?.artifactId;
            let parentGroupId: string = pomXmlData.parent?.groupId;
            let parentVersion: string = pomXmlData.parent?.version;
            let parent: string = '';
            if (parentArtifactId && parentGroupId && parentVersion) {
                parent = parentGroupId + ':' + parentArtifactId + ':' + parentVersion;
            }
            return [groupId + ':' + artifactId + ':' + version, parent];
        } catch (error) {
            treesManager.logManager.logMessage(
                'Could not get parse pom.xml GAV.\n' + 'Try Install it by running "mvn clean install" from ' + pathToPomXml + '.',
                'ERR'
            );
            treesManager.logManager.logMessage(error.stdout?.toString().replace(/(\[.*?\])/g, ''), 'ERR');
        }
        return ['', ''];
    }

    /**
     * @param workspaceFolders - Base workspace folders
     * @param progress         - Progress bar
     * @param componentsToScan - Set of maven components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
     * @param scanCacheManager - Scan cache manager
     * @param root             - The base tree node
     * @param quickScan        - True to allow using the scan cache
     */
    public static async createMavenDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Collections.Set<ComponentDetails>,
        treesManager: TreesManager,
        root: DependenciesTreeNode,
        quickScan: boolean
    ): Promise<MavenTreeNode[]> {
        let pomXmls: vscode.Uri[] = await MavenUtils.locatePomXmls(workspaceFolders, progress);
        if (pomXmls.length === 0) {
            treesManager.logManager.logMessage('No pom.xml files found in workspaces.', 'DEBUG');
            return [];
        }
        treesManager.logManager.logMessage('pom.xml files to scan: [' + pomXmls.toString() + ']', 'DEBUG');
        if (!MavenUtils.verifyMavenInstalled()) {
            vscode.window.showErrorMessage('Could not scan Maven project dependencies, because "mvn" is not in the PATH.');
            return [];
        }
        treesManager.logManager.logMessage('Found pom.xml. Analyzing ...', 'DEBUG');
        let mavenTreeNodes: MavenTreeNode[] = [];
        let prototypeTree: PomTree[] = MavenUtils.buildPrototypePomTree(pomXmls, treesManager);
        for (let ProjectTree of prototypeTree) {
            try {
                progress.report({ message: 'Analyzing pom.xml at ' + ProjectTree.pomPath });
                ProjectTree.runMavenDependencyTree();
                let dependenciesTreeNode: MavenTreeNode = new MavenTreeNode(ProjectTree.pomPath, componentsToScan, treesManager, root);
                await dependenciesTreeNode.refreshDependencies(quickScan, ProjectTree);
                if (dependenciesTreeNode.children.length === 0) {
                    root.children.splice(root.children.indexOf(dependenciesTreeNode), 1);
                } else {
                    mavenTreeNodes.push(dependenciesTreeNode);
                }
            } catch (error) {
                treesManager.logManager.logMessage(
                    'Could not get dependencies tree from pom.xml.\n' +
                        'Try Install it by running "mvn clean install" from ' +
                        ProjectTree.pomPath +
                        '.',
                    'ERR'
                );
                treesManager.logManager.logMessage(error.stdout?.toString().replace(/(\[.*?\])/g, ''), 'ERR');
            }
        }
        return mavenTreeNodes;
    }

    /**
     * for each pom:
     * 1. get the pomGav(groupId,artifactId,version)
     * 2. search pomGav from step 1 in pomTree
     *  2.1 if found remove from tree and otherwise create new node with pomGav
     * 3. update the path/parent of node from step 3
     * 4. try to add the node to its parent's children otherwise add it to the root of the tree.
     * @param pomArray list of all pom.xml uri inside root dir
     * @param treesManager
     */
    public static buildPrototypePomTree(pomArray: vscode.Uri[], treesManager: TreesManager): PomTree[] {
        let prototypeTree: PomTree[] = [];
        pomArray.forEach(pom => {
            const [pomGav, parentGav]: string[] = MavenUtils.getPomDetails(pom.fsPath, treesManager);
            if (!!pomGav) {
                let index: number = MavenUtils.searchPomGav(prototypeTree, pomGav);
                let currNode: PomTree;
                if (index > -1) {
                    currNode = prototypeTree[index];
                    prototypeTree.splice(index, 1);
                } else {
                    currNode = new PomTree(pomGav);
                }
                currNode.pomPath = path.dirname(pom.fsPath);
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
    public static getProjectInfo(rawDependency: string): [string, string, string] {
        return MavenUtils.getDependencyInfo(rawDependency.replace(/\s/g, '') + ':dummyScope');
    }

    /**
     * @param rawDependency - e.g. "|  |  +- javax.mail:mail:jar:1.4:compile"
     * @returns [groupId,ArtifactId,version]
     */
    public static getDependencyInfo(rawDependency: string): [string, string, string] {
        let result: string[] = rawDependency.split(':');
        // Skip none alphanumeric characters
        let startIndex: number = result[0].search(/\w/);
        return [result[0].slice(startIndex), result[1], result[result.length - 2]];
    }

    // 'mvn dependency:tree' duplicate the parent dependencies to its child.
    // this method filter out parent dependencies from child dependency
    public static FilterParentDependencies(childDependencies: string[], parentDeps?: string[]): string[] | undefined {
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

    public static executeMavenCmd(mvnCommand: string, pomPath: string): any {
        return exec.execSync(mvnCommand, { cwd: pomPath, maxBuffer: ScanUtils.SPAWN_PROCESS_BUFFER_SIZE });
    }
}
