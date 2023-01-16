import { IComponent } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { DependencyIssuesTreeNode } from '../../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from '../../../main/treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { FileTreeNode } from '../../../main/treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { IssueTreeNode } from '../../../main/treeDataProviders/issuesTree/issueTreeNode';
import { Severity } from '../../../main/types/severity';

export interface FileNodeTestCase {
    test: string;
    data: FileNodeTestData;
}

export interface RootNodeTestCase {
    test: string;
    path: string;
    data: FileNodeTestData[];
}

export interface FileNodeTestData {
    path: string;
    issues: Severity[];
}

/**
 * Create a dummy issues root node base on a given path
 * @param pathOfWorkspace - path of the workspace for the root node
 * @returns a dummy root node
 */
export function createRootTestNode(pathOfWorkspace: string): IssuesRootTreeNode {
    return new IssuesRootTreeNode({
        uri: {
            fsPath: pathOfWorkspace
        } as vscode.Uri
    } as vscode.WorkspaceFolder);
}

/**
 * Create file node and populate it with issues base on test case
 * @param testCase - the test we want to prepare
 * @returns node prepared base on test case
 */
export function createAndPopulateRootTestNode(rootPath: string, data: FileNodeTestData[]): IssuesRootTreeNode {
    let root: IssuesRootTreeNode = createRootTestNode(rootPath);
    if (data) {
        for (const fileData of data) {
            let fileNode: FileTreeNode = createAndPopulateFileTestNode(fileData);
            root.addChild(fileNode);
        }
    }
    root.apply();
    return root;
}

/**
 * Create file node base on test case
 * @param testCase - the test we want to prepare
 * @returns node prepared base on test case
 */
export function createFileTestNode(pathOfFile: string): FileTreeNode {
    let fileNode: FileTreeNode = new (class extends FileTreeNode {
        _issues: IssueTreeNode[] = [];
        constructor(fullPath: string, parent?: IssuesRootTreeNode, timeStamp?: number) {
            super(fullPath, parent, timeStamp);
        }
        /** @override */
        public get issues(): IssueTreeNode[] {
            return this._issues;
        }
    })(pathOfFile);
    return fileNode;
}

/**
 * Create file node and populate it with issues base on test case
 * @param testCase - the test we want to prepare
 * @returns node prepared base on test case
 */
export function createAndPopulateFileTestNode(testData: FileNodeTestData): FileTreeNode {
    let fileNode: FileTreeNode = createFileTestNode(testData.path);
    populateFileTestNode(fileNode,testData.issues);
    return fileNode;
}

export function populateFileTestNode(node: FileTreeNode, issues: Severity[]) {
    issues.forEach(issueSeverity => {
        let issue: IssueTreeNode = createDummyIssue(issueSeverity);
        node.issues.push(issue);
    });
    node.apply();
}

let issueCounter: number = 0;
/**
 * Create dummy issue node with given severity
 * @param severity - severity that the dummy node will have
 * @returns - dummy issue node
 */
export function createDummyIssue(severity: Severity): IssueTreeNode {
    let issueID: string = '' + issueCounter++;
    return new IssueTreeNode(issueID, severity, issueID);
}

export function createDummyDependencyIssues(id: string, indirect: boolean = false, parent: DescriptorTreeNode = new DescriptorTreeNode("dummy")): DependencyIssuesTreeNode {
    let component: IComponent = {
        package_name: id,
        package_version: "1.0.0",
        package_type: "",
        fixed_versions: [],
        infected_versions: [],
        impact_paths: []
    } as IComponent;
    return new DependencyIssuesTreeNode(id,component,indirect, parent);
}
