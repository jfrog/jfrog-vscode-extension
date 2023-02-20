import { IComponent, IGraphCve, IVulnerability } from 'jfrog-client-js';
import { IImpactGraph } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { CveTreeNode } from '../../../main/treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from '../../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from '../../../main/treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { ProjectDependencyTreeNode } from '../../../main/treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { FileTreeNode } from '../../../main/treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { IssueTreeNode } from '../../../main/treeDataProviders/issuesTree/issueTreeNode';
import { Severity, SeverityUtils } from '../../../main/types/severity';

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

export interface DescriptorNodeTestData {
    path: string;
    issues: DependencyIssuesNodeTestData[];
}

export interface DependencyIssuesNodeTestData {
    name: string;
    version: string;
    indirect?: boolean;
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
    populateFileTestNode(fileNode, testData.issues);
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

/**
 * Create dummy dependency with issues given name and version
 * @param name - the name of the dummy component
 * @param version - the version of the dummy component
 * @param parent - the parent of the dummy (optional or default created)
 * @param indirect - is the dummy dependency direct/indirect
 * @returns dummy dependency with issues
 */
export function createDummyDependencyIssues(
    name: string,
    version: string,
    parent: ProjectDependencyTreeNode = new ProjectDependencyTreeNode('dummy'),
    indirect: boolean = false
): DependencyIssuesTreeNode {
    return parent.addNode(
        name + version,
        {
            package_name: name,
            package_version: version,
            package_type: '',
            fixed_versions: [],
            infected_versions: [],
            impact_paths: []
        } as IComponent,
        indirect
    );
}

/**
 * Create dummy dependency with issues base on a given test data
 * @param testData - the test data to generate dummy objects
 * @param parent - the parent of the dummy (optional or default created)
 * @returns dummy dependency with issues
 */
export function createAndPopulateDependencyIssues(
    testData: DependencyIssuesNodeTestData,
    parent: DescriptorTreeNode = new DescriptorTreeNode('dummy')
): DependencyIssuesTreeNode {
    let node: DependencyIssuesTreeNode = createDummyDependencyIssues(testData.name, testData.version, parent, testData.indirect);
    testData.issues.forEach(issueSeverity => {
        let issue: IssueTreeNode = createDummyIssue(issueSeverity);
        node.issues.push(<CveTreeNode>issue);
    });
    node.apply();
    return node;
}

/**
 * Create dummy descriptor with issues base on a given test data
 * @param testData - the test data to generate dummy objects
 * @returns dummy descriptor
 */
export function createAndPopulateDescriptor(testData: DescriptorNodeTestData): DescriptorTreeNode {
    let node: DescriptorTreeNode = new DescriptorTreeNode(testData.path);
    for (let dependencyTestCase of testData.issues) {
        createAndPopulateDependencyIssues(dependencyTestCase, node);
    }
    node.apply();
    return node;
}

/**
 * Create a dummy CVE issue node
 * @param severity - the severity of the dummy node
 * @param cve - optional cve id for CVE issues (without the id used is issue_id)
 * @param parent - optional parent for this issue, generated default if not provided
 * @returns - dummy CVE issue node
 */
export function createDummyCveIssue(
    severity: Severity,
    parent: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '1.0.0'),
    cveId?: string,
    issueID: string = '' + issueCounter++
): CveTreeNode {
    let component: IComponent = {
        package_name: parent.name,
        package_version: parent.version,
        package_type: '',
        fixed_versions: [],
        infected_versions: [],
        impact_paths: []
    } as IComponent;
    let cveNode: IGraphCve = { cve: cveId } as IGraphCve;
    let node: CveTreeNode = new CveTreeNode(
        {
            issue_id: issueID,
            cves: cveId ? [cveNode] : [],
            severity: SeverityUtils.getString(severity),
            summary: '',
            references: [],
            components: new Map<string, IComponent>()
        } as IVulnerability,
        severity,
        parent,
        component,
        {} as IImpactGraph,
        cveNode
    );
    parent.issues.push(node);
    return node;
}
