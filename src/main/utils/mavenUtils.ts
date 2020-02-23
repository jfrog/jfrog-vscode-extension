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
import { getTempFolder, readFileIfExists, removeFile } from './contextUtils';
import { PomTree } from './prototypePomTree';

export const DOCUMENT_SELECTOR: any = { scheme: 'file', pattern: '**/pom.xml' };
export const PKG_TYPE: string = 'maven';
export let pathToNode: Map<string, MavenTreeNode> = new Map<string, MavenTreeNode>();

/**
 * Get pom.xml file and return the position of 'require' section.
 * @param document - pom.xml file
 */
export function getDependenciesPos(document: vscode.TextDocument): vscode.Position[] {
    let res: vscode.Position[] = [];
    let mavenModContent: string = document.getText();
    let dependenciesMatch: RegExpMatchArray | null = mavenModContent.match('<dependencies>');
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
export function getDependencyPos(document: vscode.TextDocument, dependenciesTreeNode: DependenciesTreeNode | undefined): vscode.Position[] {
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
        return getDependencyPos(document, dependenciesTreeNode.parent);
    }
    return [];
}

/**
 * Find pom.xml files in workspaces.
 * @param workspaceFolders - Base workspace folders to search
 * @param progress         - progress bar
 */
export async function locatePomXmls(
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

    // we need to sort so on each time adn on each OS we will get the same order
    return Promise.resolve(result.length > 1 ? result.sort((a: vscode.Uri, b: vscode.Uri) => a.fsPath.localeCompare(b.fsPath)) : result);
}

// Get raw dependencies list for the root of the project
export function getPomDetails(pathToPomXml: string, treesManager: TreesManager): string[] {
    try {
        const outputPath: string = getTempFolder(pathToPomXml);
        executeMavenCmd(`mvn dependency:tree -DappendOutput=true -DoutputFile="${outputPath}"`, pathToPomXml);
        const pomDetails: string | undefined = readFileIfExists(outputPath);
        removeFile(outputPath);
        const rawPomDetails: RegExpMatchArray = pomDetails?.match(/^[^\s]*\s/)!;
        const pomDependencies: string | undefined = pomDetails?.slice(rawPomDetails![0].length).trim();
        const [groupId, artifactId, version] = getProjectInfo(rawPomDetails![0]);
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
    }
}

/**
 * @param workspaceFolders - Base workspace folders
 * @param progress         - Progress bar
 * @param componentsToScan - Set of maven components to populate during the tree building. We'll use this set later on, while scanning the packages with Xray.
 * @param scanCacheManager - Scan cache manager
 * @param root           - The base tree node
 * @param quickScan        - True to allow using the scan cache
 */
export async function createMavenDependenciesTrees(
    workspaceFolders: vscode.WorkspaceFolder[],
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    componentsToScan: Collections.Set<ComponentDetails>,
    treesManager: TreesManager,
    root: DependenciesTreeNode,
    quickScan: boolean
): Promise<MavenTreeNode[]> {
    let pomXmls: vscode.Uri[] = await locatePomXmls(workspaceFolders, progress);
    if (pomXmls.length === 0) {
        treesManager.logManager.logMessage('No pom.xml files found in workspaces.', 'DEBUG');
        return [];
    }
    treesManager.logManager.logMessage('pom.xml files to scan: [' + pomXmls.toString() + ']', 'DEBUG');
    if (!verifyMavenInstalled()) {
        vscode.window.showErrorMessage('Could not scan Maven project dependencies, because "mvn" is not in the PATH.');
        return [];
    }
    let mavenTreeNodes: MavenTreeNode[] = [];
    let prototypeTree: PomTree[] = buildPrototypePomTree(pomXmls, treesManager);
    for (let ProjectTree of prototypeTree) {
        progress.report({ message: 'Analyzing pom.xml at ' + ProjectTree.pomPath });
        // let projectDependenciesList: string[] = await getRawDependenciesList(ProjectTree.pomPath, treesManager);
        // if (projectDependenciesList.length === 0) {
        //     break;
        // }
        // FilterParentDependencies(projectDependenciesList);
        let dependenciesTreeNode: MavenTreeNode = new MavenTreeNode(ProjectTree.pomPath, componentsToScan, treesManager, root);
        dependenciesTreeNode.refreshDependencies(quickScan, ProjectTree, mavenTreeNodes);
        mavenTreeNodes.push(dependenciesTreeNode);
    }
    return mavenTreeNodes;
}

/**
 * @param pomArray list of all pom.xml uri inside root dir
 * for each pom:
 * 1. get the pomId(groupId,artifactId,version)
 * 2. search pomId from step 1 in pomTree
 *  2.1 if found remove from tree and otherwise create new node with pomId
 * 3/ update the path/parent of node from step 3
 * 4. try to add the node to its parent's children otherwise add it to the root of the tree.
 */
export function buildPrototypePomTree(pomArray: vscode.Uri[], treesManager: TreesManager): PomTree[] {
    let result: PomTree[] = [];
    pomArray.forEach(pom => {
        try {
            const [pomId, rawDependencies]: string[] = getPomDetails(pom.fsPath, treesManager);
            if (!!pomId) {
                let parentId: string = getParentInfo(pom);
                let index: number = searchPomId(result, pomId);
                let currNode: PomTree;
                // If the node already exists get it and remove it from tree other wise create a new node
                if (index > -1) {
                    currNode = result[index];
                    result.splice(index, 1);
                } else {
                    currNode = new PomTree(pomId);
                }
                currNode.pomPath = path.dirname(pom.fsPath);
                currNode.rawDependencies = rawDependencies;
                currNode.parentId = parentId;
                addNode(result, currNode);
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
    return result;
}
// If the node have parent do:
// 1. check if the parent already in the tree,
//     1.1 if its add to its child
//     1.2 else create the parent and add the parent to the array
// 2.otherwise add the node to the array
export function addNode(array: PomTree[], node: PomTree) {
    if (!!node.parentId) {
        const parentNode: PomTree | undefined = deepSearchNode(array, node.parentId);
        if (!!parentNode) {
            parentNode.addChild(node);
        } else {
            const ParentPom: PomTree = new PomTree(node.parentId);
            ParentPom.addChild(node);
            array.push(ParentPom);
        }
    } else {
        array.push(node);
    }
}

export function verifyMavenInstalled(): boolean {
    try {
        exec.execSync('mvn -version');
    } catch (error) {
        return false;
    }
    return true;
}

export function getParentInfo(pomXml: vscode.Uri): string {
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

export function deepSearchNode(array: PomTree[], pomId: string): PomTree | undefined {
    for (let index: number = 0; index < array.length; index++) {
        if (pomId === array[index].pomId) {
            return array[index];
        }
        if (!!array[index].children) {
            deepSearchNode(array[index].children!, pomId);
        }
    }
    return;
}

export function searchPomId(array: PomTree[], pomId: string): number {
    for (let index: number = 0; index < array.length; index++) {
        if (pomId === array[index].pomId) {
            return index;
        }
    }
    return -1;
}

/**
 *  @example
 * --- maven-dependency-plugin:2.8:tree (default-cli) @ multi2 ---
 *      org.jfrog.test:multi2:jar:3.7-SNAPSHOT
 *     \- javax.servlet.jsp:jsp-api:jar:2.1:compile
 * @returns 'org.jfrog.test:multi2:3.7-SNAPSHOT'
 * @param rawDependency Raw dependency text
 */
export function getProjectInfo(rawDependency: string): [string, string, string] {
    return getDependencyInfo(rawDependency.replace(/\s/g, '') + ':dummyText');
}

/**
 *@example of raw dependency "|  |  +- javax.mail:mail:jar:1.4:compile"
 * @param rawDependency
 * @returns [groupId,ArtifactId,verion] aka [javax.mail, mail, 1.4]
 */
export function getDependencyInfo(rawDependency: string): [string, string, string] {
    let result: string[] = rawDependency.split(':');
    //skip none alphabet letters
    let startIndex: number = result[0].search(/[A-Za-z0-9]/);
    return [result[0].slice(startIndex), result[1], result[result.length - 2]];
}
export function searchPomDependencies(pomId: string, dependenciesList: string[]): string | undefined {
    for (const iterator of dependenciesList) {
        const [groupId, artifactId, version] = getProjectInfo(iterator);
        if (groupId + ':' + artifactId + ':' + version === pomId) {
            return iterator;
        }
    }
    return;
}

// 'mvn dependency:tree' duplicate the parent dependencies to its child.
// this method filter out parent dependencies from child dependency
export function FilterParentDependencies(parentDeps: DependenciesTreeNode[], childNode: PomTree) {
    parentDeps.forEach(element => {
        if (!(element instanceof MavenTreeNode)) {
            const regex: RegExp = new RegExp(`^.*${element.label}.*$`, 'mg');
            childNode.rawDependencies = childNode.rawDependencies.replace(regex, '').trim();
        }
    });
}

function executeMavenCmd(mvnCommand: string, pomPath: string): void {
    exec.execSync(mvnCommand, { cwd: path.dirname(pomPath) });
}
