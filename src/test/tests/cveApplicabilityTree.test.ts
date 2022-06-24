import * as vscode from 'vscode';
import * as path from 'path';
import { assert } from 'chai';
import { SourceCodeCveTreeNode, SourceCodeCveTreeNodeDetails } from '../../main/treeDataProviders/sourceCodeTree/sourceCodeCveNode';
import { SourceCodeFileTreeNode } from '../../main/treeDataProviders/sourceCodeTree/sourceCodeFileTreeNode';
import { Severity } from '../../main/types/severity';
import { SourceCodeRootTreeNode } from '../../main/treeDataProviders/sourceCodeTree/sourceCodeRootTreeNode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { ScanLogicManager } from '../../main/scanLogic/scanLogicManager';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { createScanCacheManager } from './utils/utils.test';
import { SourceCodeTreeDataProvider } from '../../main/treeDataProviders/sourceCodeTree/sourceCodeTreeDataProvider';
import { IIssueCacheObject } from '../../main/types/issueCacheObject';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { IIssueKey } from '../../main/types/issueKey';
import { IssuesDataProvider, VulnerabilityNode } from '../../main/treeDataProviders/issuesDataProvider';
import { DependencyDetailsProvider } from '../../main/treeDataProviders/dependencyDetailsProvider';
import { TreeDataHolder } from '../../main/treeDataProviders/utils/treeDataHolder';
import { PackageType } from '../../main/types/projectType';

describe('Cve Applicability Tree Tests', () => {
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'npm', 'cveApplicability'));
    let dependenciesTreeNode: DependenciesTreeNode;
    let logManager: LogManager = new LogManager().activate();
    let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();

    let treesManager: TreesManager = new TreesManager(
        [],
        new ConnectionManager(logManager),
        dummyScanCacheManager,
        {} as ScanLogicManager,
        logManager
    );

    before(() => {
        let generalInfo: GeneralInfo = new GeneralInfo('odin', '1.2.3', [], tmpDir.path, 'asgard');
        dependenciesTreeNode = new DependenciesTreeNode(generalInfo);
        workspaceFolders = [
            {
                uri: tmpDir,
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
    });

    it('Source Code Cve Tree Node', () => {
        const cve: string = 'CVE-2021-31597';
        const sourceCodeCveTreeNodeDetails: SourceCodeCveTreeNodeDetails[] = [new SourceCodeCveTreeNodeDetails('abc', 'def', 1, 2, 3, 4)];
        const node: SourceCodeCveTreeNode = new SourceCodeCveTreeNode(cve, sourceCodeCveTreeNodeDetails, undefined, Severity.High);
        assert.equal(node.cve, cve);
        assert.equal(node.parent, undefined);

        const nodeDetails: SourceCodeCveTreeNodeDetails[] = node.getNodeDetails();
        assert.equal(nodeDetails.length, 1);
        assert.deepEqual(nodeDetails[0], sourceCodeCveTreeNodeDetails[0]);
        assert.equal(node.getFile(), '');

        const children: (vscode.TreeItem | TreeDataHolder)[] = node.children;
        assert.equal(children.length, 2);
    });

    it('Source Code File Tree Node', () => {
        const cve: string = 'CVE-2021-31597';
        const sourceCodeCveTreeNodeDetails: SourceCodeCveTreeNodeDetails[] = [new SourceCodeCveTreeNodeDetails('abc', 'def', 1, 2, 3, 4)];
        let sourceCodeFileTreeNode: SourceCodeFileTreeNode = new SourceCodeFileTreeNode('a/b/c', []);
        const node1: SourceCodeCveTreeNode = new SourceCodeCveTreeNode(cve, sourceCodeCveTreeNodeDetails, sourceCodeFileTreeNode, Severity.High);
        const node2: SourceCodeCveTreeNode = new SourceCodeCveTreeNode(cve, sourceCodeCveTreeNodeDetails, sourceCodeFileTreeNode, Severity.Low);
        assert.equal(sourceCodeFileTreeNode.topSeverity, Severity.High);
        assert.equal(sourceCodeFileTreeNode.children.length, 2);
        assert.deepEqual(sourceCodeFileTreeNode.children[0], node1);
        assert.deepEqual(sourceCodeFileTreeNode.children[1], node2);

        sourceCodeFileTreeNode = SourceCodeFileTreeNode.createFailedScan();
        assert.equal(sourceCodeFileTreeNode.children.length, 0);
        assert.equal(sourceCodeFileTreeNode.label, 'Fail to scan project');
        assert.equal(sourceCodeFileTreeNode.collapsibleState, vscode.TreeItemCollapsibleState.None);

        sourceCodeFileTreeNode = SourceCodeFileTreeNode.createNoVulnerabilitiesFound();
        assert.equal(sourceCodeFileTreeNode.children.length, 0);
        assert.equal(sourceCodeFileTreeNode.label, 'No vulnerabilities found');
        assert.equal(sourceCodeFileTreeNode.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    it('Source Code Root Tree Node', () => {
        const cve1: string = 'CVE-2021-31597';
        const cve2: string = 'CVE-2021-43818';
        const sourceCodeCveTreeNodeDetails: SourceCodeCveTreeNodeDetails[] = [new SourceCodeCveTreeNodeDetails('abc', 'def', 1, 2, 3, 4)];
        const node1: SourceCodeCveTreeNode = new SourceCodeCveTreeNode(cve1, sourceCodeCveTreeNodeDetails, undefined, Severity.High);
        const node2: SourceCodeCveTreeNode = new SourceCodeCveTreeNode(cve2, sourceCodeCveTreeNodeDetails, undefined, Severity.Low);
        let sourceCodeFileTreeNode: SourceCodeFileTreeNode = new SourceCodeFileTreeNode('a/b/c', [node1, node2]);
        let sourceCodeRootTreeNode: SourceCodeRootTreeNode = new SourceCodeRootTreeNode('path/to/my-project', PackageType.NPM, [
            sourceCodeFileTreeNode
        ]);

        assert.equal(sourceCodeRootTreeNode.label, 'my-project');
        assert.equal(sourceCodeRootTreeNode.description, 'path/to/my-project');
        assert.equal(sourceCodeRootTreeNode.isCveApplicable(cve1), false);
        assert.equal(sourceCodeRootTreeNode.isCveNotApplicable(cve1), false);

        sourceCodeRootTreeNode.noApplicableCves = new Set<string>([cve1]);
        sourceCodeRootTreeNode.applicableCves = new Map<string, SourceCodeCveTreeNode>([[cve2, node2]]);

        assert.equal(sourceCodeRootTreeNode.isCveNotApplicable(cve1), true);
        assert.equal(sourceCodeRootTreeNode.isCveNotApplicable(cve2), false);

        assert.equal(sourceCodeRootTreeNode.isCveApplicable(cve2), true);
        assert.equal(sourceCodeRootTreeNode.isCveApplicable(cve1), false);
    });

    it('Source Code Tree Data Provider', async () => {
        let issue: IIssueCacheObject = {
            issueId: 'XRAY-123',
            severity: Severity.Critical,
            cves: ['CVE-2020-11022', 'CVE-2018-7749', 'CVE-7777-7777']
        } as IIssueCacheObject;

        const sourceCodeTreeDataProvider: SourceCodeTreeDataProvider = new SourceCodeTreeDataProvider(workspaceFolders, treesManager);
        let dependencyDetailsProvider: DependencyDetailsProvider = new DependencyDetailsProvider(dummyScanCacheManager, sourceCodeTreeDataProvider);
        let issuesDataProvider: IssuesDataProvider = dependencyDetailsProvider.issuesDataProvider;
        dependenciesTreeNode.issues.add({ issue_id: issue.issueId } as IIssueKey);
        dummyScanCacheManager.storeIssue(issue);
        await sourceCodeTreeDataProvider.update();
        await sourceCodeTreeDataProvider.scanProjects();

        const projectPath: string = workspaceFolders[0].uri.path;
        const filePath: string = path.join(projectPath, 'bad.js');
        assert.isTrue(sourceCodeTreeDataProvider.isFileScanned(filePath));
        assert.isFalse(sourceCodeTreeDataProvider.isFileScanned('not-found-path'));

        assert.isTrue(sourceCodeTreeDataProvider.isCveApplicable(projectPath, 'CVE-2020-11022'));
        assert.isFalse(sourceCodeTreeDataProvider.isCveApplicable(projectPath, 'CVE-2018-7749'));
        const node: SourceCodeCveTreeNode | undefined = sourceCodeTreeDataProvider.getCveApplicable(projectPath, 'CVE-2020-11022');
        assert.isTrue(node !== undefined);
        assert.equal(node?.label, 'CVE-2020-11022');
        assert.equal(node?.cve, 'CVE-2020-11022');
        assert.equal(node?.contextValue, 'jfrog.source.code.scan.jumpToSource.enabled');
        assert.equal(node?.parent?.filePath, filePath);

        assert.isTrue(sourceCodeTreeDataProvider.isCveNotApplicable(projectPath, 'CVE-2018-7749'));
        assert.isFalse(sourceCodeTreeDataProvider.isCveNotApplicable(projectPath, 'CVE-2020-11022'));

        const tree: SourceCodeFileTreeNode | undefined = sourceCodeTreeDataProvider.getFileTreeNode(filePath);
        assert.isTrue(tree !== undefined);
        assert.equal(tree?.label, 'bad.js');
        const children: number = tree?.children?.length ?? 0;
        assert.isTrue(children >= 2);
        assert.equal(tree?.parent?.label, 'cveApplicability');
        assert.equal(tree?.parent?.workspaceFolder, projectPath);

        const projects: Map<string, SourceCodeRootTreeNode> = sourceCodeTreeDataProvider.getScannedProjects();
        assert.isTrue(projects !== undefined);
        assert.equal(projects.size, 1);
        assert.isTrue(projects.has(projectPath));
        assert.deepEqual(projects.get(projectPath), tree?.parent);

        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        issuesDataProvider.selectedNode = dependenciesTreeNode;
        let vulnerabilityNodes: VulnerabilityNode[] = await issuesDataProvider.getChildren(dependenciesTreeNode);
        assert.isTrue(vulnerabilityNodes !== undefined);
        vulnerabilityNodes.forEach(vulnerabilityNode => {
            ['CVE-2020-11022 🔴  Applicable', 'CVE-2018-7749 🟢  Not applicable', 'CVE-7777-7777'].includes(vulnerabilityNode.cve ?? '');
        });
        assert;
    });
});
