import * as vscode from 'vscode';
import * as Collections from 'typescript-collections';
import * as path from 'path';
import fs from 'fs';
import * as exec from 'child_process';
import { ScanUtils } from './scanUtils';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { ComponentDetails } from 'xray-client-js';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/mavenTreeNode';
import { PomTree } from './pomTree';
import { ContextUtils } from './contextUtils';
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

    public static getPomDetails(pathToPomXml: string, treesManager: TreesManager): string[] {
        let outputPath: string = '';
        try {
            outputPath = ContextUtils.getTempFolder(pathToPomXml, treesManager);
            this.executeMavenCmd(`mvn dependency:tree -DappendOutput=true -DoutputFile="${outputPath}"`, pathToPomXml);
            const pomContent: string | undefined = ContextUtils.readFileIfExists(outputPath);
            const rawPomDetails: RegExpMatchArray = pomContent?.match(/^[^\s]*\s/)!;
            if (!rawPomDetails) {
                throw new Error('Could not parse dependencies tree');
            }
            const pomDependencies: string | undefined = pomContent?.slice(rawPomDetails[0].length).trim();
            const [groupId, artifactId, version] = MavenUtils.getProjectInfo(rawPomDetails[0]);
            return [groupId + ':' + artifactId + ':' + version, pomDependencies!];
        } catch (error) {
            treesManager.logManager.logError(error, false);
            treesManager.logManager.logMessage(
                `Could not get dependencies tree from pom.xml (path: ${path.dirname(pathToPomXml)}).
            'Possible cause: The project needs to be installed by maven. Install it by running "mvn clean install" from ${path.dirname(
                pathToPomXml
            )}.`,
                'ERR'
            );
            return [];
        } finally {
            ContextUtils.removeFile(outputPath);
        }
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
        let mavenTreeNodes: MavenTreeNode[] = [];
        let prototypeTree: PomTree[] = MavenUtils.buildPrototypePomTree(pomXmls, treesManager);
        for (let ProjectTree of prototypeTree) {
            progress.report({ message: 'Analyzing pom.xml at ' + ProjectTree.pomPath });
            let dependenciesTreeNode: MavenTreeNode = new MavenTreeNode(ProjectTree.pomPath, componentsToScan, treesManager, root);
            dependenciesTreeNode.refreshDependencies(quickScan, ProjectTree);
            mavenTreeNodes.push(dependenciesTreeNode);
        }
        return mavenTreeNodes;
    }

    /**
     * for each pom:
     * 1. get the pomId(groupId,artifactId,version)
     * 2. search pomId from step 1 in pomTree
     *  2.1 if found remove from tree and otherwise create new node with pomId
     * 3. update the path/parent of node from step 3
     * 4. try to add the node to its parent's children otherwise add it to the root of the tree.
     * @param pomArray list of all pom.xml uri inside root dir
     * @param treesManager
     */
    public static buildPrototypePomTree(pomArray: vscode.Uri[], treesManager: TreesManager): PomTree[] {
        let prototypeTree: PomTree[] = [];
        pomArray.forEach(pom => {
            try {
                const [pomId, rawDependencies]: string[] = MavenUtils.getPomDetails(pom.fsPath, treesManager);
                if (!!pomId) {
                    let parentId: string = MavenUtils.getParentInfo(pom);
                    let index: number = MavenUtils.searchPomId(prototypeTree, pomId);
                    let currNode: PomTree;
                    // If the node already exists get it and remove it from tree other wise create a new node
                    if (index > -1) {
                        currNode = prototypeTree[index];
                        prototypeTree.splice(index, 1);
                    } else {
                        currNode = new PomTree(pomId);
                    }
                    currNode.pomPath = path.dirname(pom.fsPath);
                    currNode.rawDependencies = rawDependencies;
                    currNode.parentId = parentId;
                    MavenUtils.addPrototypeNode(prototypeTree, currNode);
                }
            } catch (error) {
                treesManager.logManager.logError(error, false);
                treesManager.logManager.logMessage(
                    'Could not get dependencies tree from pom.xml (path: ' +
                        pom +
                        ').\n' +
                        'Possible cause: The project needs to be installed by maven. Install it by running "mvn clean install" from ' +
                        pom +
                        '.',
                    'ERR'
                );
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
        if (!!node.parentId) {
            const parentNode: PomTree | undefined = MavenUtils.getPrototypeNode(pomArray, node.parentId);
            if (!!parentNode) {
                parentNode.addChild(node);
            } else {
                const parentPom: PomTree = new PomTree(node.parentId);
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

    public static getParentInfo(pomXml: vscode.Uri): string {
        const parentText: RegExpMatchArray | null = fs
            .readFileSync(pomXml.fsPath)
            .toString()
            .match(/<parent>(.|\s)*?<\/parent>/);
        if (parentText && parentText[0]) {
            const groupId: RegExpMatchArray | null = parentText[0].toString().match(/(?<=\<groupId>).+?(?=\<\/groupId>)/i);
            const artifactId: RegExpMatchArray | null = parentText[0].toString().match(/(?<=\<artifactId>).+?(?=\<\/artifactId>)/i);
            const version: RegExpMatchArray | null = parentText[0].toString().match(/(?<=\<version>).+?(?=\<\/version>)/i);
            return groupId + ':' + artifactId + ':' + version;
        }
        return '';
    }

    public static getPrototypeNode(prototypeTreeArray: PomTree[], pomId: string): PomTree | undefined {
        for (const prototypeTree of prototypeTreeArray) {
            const node: PomTree | undefined = prototypeTree.deepSearch(pomId);
            if (node) {
                return node;
            }
        }
        return;
    }

    public static searchPomId(pomTreeArray: PomTree[], pomId: string): number {
        return pomTreeArray.findIndex(pomTree => pomTree.pomId === pomId);
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
    public static FilterParentDependencies(parentDeps: DependenciesTreeNode[], childNode: PomTree) {
        parentDeps.forEach(element => {
            if (!(element instanceof MavenTreeNode)) {
                const regex: RegExp = new RegExp(`^.*${element.label}.*$`, 'mg');
                childNode.rawDependencies = childNode.rawDependencies.replace(regex, '').trim();
            }
        });
    }

    public static executeMavenCmd(mvnCommand: string, pomPath: string): void {
        exec.execSync(mvnCommand, { cwd: path.dirname(pomPath), maxBuffer: DependenciesTreeNode.SPAWN_PROCESS_BUFFER_SIZE });
    }
}
