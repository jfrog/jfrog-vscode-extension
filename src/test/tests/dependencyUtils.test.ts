import * as path from 'path';
import * as fs from 'fs';

import { IGraphResponse } from 'jfrog-client-js';
import { describe } from 'mocha';
import { DependencyScanResults, ScanResults } from '../../main/types/workspaceIssuesDetails';
import { DependencyUtils } from '../../main/treeDataProviders/utils/dependencyUtils';
import { DescriptorTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { assert } from 'chai';
import { IImpactGraph, IImpactGraphNode } from 'jfrog-ide-webview';
import { BuildTreeErrorType, RootNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { FileScanBundle, FileScanError, NotEntitledError, ScanCancellationError } from '../../main/utils/scanUtils';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { LogManager } from '../../main/log/logManager';
import { PackageType } from '../../main/types/projectType';
import { createDependency, createRootTestNode } from './utils/treeNodeUtils.test';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { IssueTreeNode } from '../../main/treeDataProviders/issuesTree/issueTreeNode';

describe.only('Dependency Utils Tests', () => {
    let logManager: LogManager = new LogManager().activate();

    const scanResponses: string = path.join(__dirname, '..', 'resources', 'scanResponses');

    let root: RootNode = getTestRoot();
    let expectedImpactedTree: Map<string, IImpactGraph> = getExpectedImpactedTree(root);

    const testCases: any[] = [
        {
            name: 'No issues response',
            response: {} as IGraphResponse,
            expectedTree: {},
            expectedCveCount: 0,
            expectedComponentsWithIssueCount: 0,
            expectedTotalIssueCount: 0,
            expectedDirect: []
        },
        {
            name: 'Vulnerabilities response',
            response: getGraphResponse('scanGraphVulnerabilities'),
            expectedTree: Object.fromEntries(expectedImpactedTree.entries()),
            expectedCveCount: 3,
            expectedComponentsWithIssueCount: 4,
            expectedTotalIssueCount: 5,
            expectedDirect: ['A:1.0.0', 'B:1.0.0', 'C:2.0.0']
        },
        {
            name: 'Violations response',
            response: getGraphResponse('scanGraphViolations'),
            expectedTree: Object.fromEntries(expectedImpactedTree.entries()),
            expectedCveCount: 3,
            expectedComponentsWithIssueCount: 4,
            expectedTotalIssueCount: 5,
            expectedDirect: ['A:1.0.0', 'B:1.0.0', 'C:2.0.0']
        }
    ];

    function getTestRoot(): RootNode {
        let node: RootNode = new RootNode('path', PackageType.Unknown);
        node.generalInfo.artifactId = 'root';
        node.generalInfo.version = '1.0.0';
        //        ---- Root --------------
        //      /        |         \       \
        //  A:1.0.0  B:1.0.0   C:2.0.0     E:1.2.3
        //          /          /      \        \
        //       A:1.0.1   D:3.0.0   A:1.0.0   F:3.2.1
        createDependency('A', '1.0.0', node);
        let b: DependenciesTreeNode = createDependency('B', '1.0.0', node);
        createDependency('A', '1.0.1', b);
        let c: DependenciesTreeNode = createDependency('C', '2.0.0', node);
        createDependency('D', '3.0.0', c);
        createDependency('A', '1.0.0', c);
        createDependency('F', '3.2.1', createDependency('E', '1.2.3', node));
        return node;
    }

    function getExpectedImpactedTree(root: RootNode): Map<string, IImpactGraph> {
        let map: Map<string, IImpactGraph> = new Map<string, IImpactGraph>();
        map.set('XRAY-191882' + 'A:1.0.0', {
            root: {
                name: root.componentId,
                children: [
                    { name: 'A:1.0.0' } as IImpactGraphNode,
                    { name: 'C:2.0.0', children: [{ name: 'A:1.0.0' } as IImpactGraphNode] } as IImpactGraphNode
                ]
            } as IImpactGraphNode,
            pathsLimit: undefined
        } as IImpactGraph);
        map.set('XRAY-191882' + 'C:2.0.0', {
            root: {
                name: root.componentId,
                children: [{ name: 'C:2.0.0' } as IImpactGraphNode]
            },
            pathsLimit: undefined
        } as IImpactGraph);
        // issue XRAY-94201, for components B:1.0.0
        map.set('XRAY-94201' + 'B:1.0.0', {
            root: {
                name: root.componentId,
                children: [{ name: 'B:1.0.0' } as IImpactGraphNode]
            },
            pathsLimit: undefined
        } as IImpactGraph);
        // issue XRAY-142007, for components [A:1.0.1, C:2.0.0]
        map.set('XRAY-142007' + 'A:1.0.1', {
            root: {
                name: root.componentId,
                children: [{ name: 'B:1.0.0', children: [{ name: 'A:1.0.1' } as IImpactGraphNode] } as IImpactGraphNode]
            },
            pathsLimit: undefined
        } as IImpactGraph);
        map.set('XRAY-142007' + 'C:2.0.0', {
            root: {
                name: root.componentId,
                children: [{ name: 'C:2.0.0' } as IImpactGraphNode]
            },
            pathsLimit: undefined
        } as IImpactGraph);
        return map;
    }

    function getGraphResponse(type: string): IGraphResponse {
        let graphResponse: string = fs.readFileSync(path.join(scanResponses, type + '.json'), 'utf8');
        return Object.assign({} as IGraphResponse, JSON.parse(graphResponse));
    }

    testCases.forEach(test => {
        it('Create impacted tree - ' + test.name, async () => {
            let impactedTree: Map<string, IImpactGraph> = DependencyUtils.createImpactedGraph(root, test.response);
            assert.deepEqual(Object.fromEntries(impactedTree.entries()), test.expectedTree);
            // Test get direct components
            let direct: Set<string> = DependencyUtils.getDirectComponents(impactedTree);
            assert.sameMembers(test.expectedDirect, Array.from(direct));
        });
    });

    describe('Limit impacted graph', () => {
        it('Set paths limit to 1', () => {
            const ORIGIN_IMPACT_PATHS_LIMIT: number = RootNode.IMPACT_PATHS_LIMIT;
            RootNode.IMPACT_PATHS_LIMIT = 1;

            let impactedTree: Map<string, IImpactGraph> = DependencyUtils.createImpactedGraph(root, getGraphResponse('scanGraphVulnerabilities'));

            assert.equal(impactedTree.get('XRAY-191882A:1.0.0')?.pathsLimit, 1);
            assert.equal(impactedTree.get('XRAY-191882A:1.0.0')?.root.children?.length, 1);

            RootNode.IMPACT_PATHS_LIMIT = ORIGIN_IMPACT_PATHS_LIMIT;
        });
    });

    testCases.forEach(test => {
        it('Populate DependencyScanResults - ' + test.name, async () => {
            let scanResult: DependencyScanResults = {
                graphScanTimestamp: 1,
                dependenciesGraphScan: test.response,
                impactTreeData: test.expectedTree
            } as DependencyScanResults;
            let node: DescriptorTreeNode = new DescriptorTreeNode('path');
            let issuesFound: number = DependencyUtils.populateDependencyScanResults(node, scanResult);
            assert.equal(issuesFound, test.expectedCveCount);
            assert.lengthOf(node.dependenciesWithIssue, test.expectedComponentsWithIssueCount);
            assert.lengthOf(node.issues, test.expectedTotalIssueCount);
            if (issuesFound > 0) {
                // Make sure indirect is flagged and also issue in same component combined
                let a: DependencyIssuesTreeNode | undefined = node.getDependencyByID('A:1.0.0');
                assert.isDefined(a);
                assert.isFalse(a?.indirect);
                // Make sure license is populated
                assert.equal(a?.licenses.length, 1);
                assert.equal(a?.licenses[0].name, 'Apache-2.0');
                // Make sure no duplications and watches combined
                let aIssues: IssueTreeNode[] | undefined = a?.issues;
                assert.isDefined(aIssues);
                assert.equal(aIssues?.length, 1);
                let aIssue: IssueTreeNode = <IssueTreeNode>aIssues?.[0];
                assert.sameMembers(aIssue.watchNames, test.name.includes('Violations') ? ['watch1', 'watch2'] : []);
                // Make sure not impacted components are filtered
                assert.isUndefined(node.getDependencyByID('E:1.2.3'));
                assert.isUndefined(node.getDependencyByID('F:3.2.1'));
                assert.isUndefined(node.getDependencyByID('D:3.0.0'));
                // Make sure multiple issues per dependency are populated
                assert.equal(node.getDependencyByID('C:2.0.0')?.issues.length, 2);
            }
        });
    });

    [
        {
            name: 'No bundle',
            err: new Error(),
            withBundle: false,
            // Expected to throw error since no file information provided
            expectedThrow: true,
            expectedNodeName: undefined
        },
        {
            name: 'General error',
            err: new Error(),
            withBundle: true,
            // Expected not to throw and to create failed scan node with default reason
            expectedThrow: false,
            expectedNodeName: DependencyUtils.FAIL_TO_SCAN
        },
        {
            name: 'Not installed error',
            err: new FileScanError(BuildTreeErrorType.NotInstalled, BuildTreeErrorType.NotInstalled),
            withBundle: true,
            // Expected not to throw and to create failed scan node with specific reason
            expectedThrow: false,
            expectedNodeName: BuildTreeErrorType.NotInstalled
        },
        {
            name: 'Not supported error',
            err: new FileScanError(BuildTreeErrorType.NotSupported, BuildTreeErrorType.NotSupported),
            withBundle: true,
            // Expected not to throw and to create failed scan node with specific reason
            expectedThrow: false,
            expectedNodeName: BuildTreeErrorType.NotSupported
        },
        {
            name: 'Cancel error',
            err: new ScanCancellationError(),
            withBundle: true,
            // Expected to throw error to cancel the whole scan
            expectedThrow: true,
            expectedNodeName: undefined
        },
        {
            name: 'Not-entitled error',
            err: new NotEntitledError(),
            withBundle: true,
            // Expected not to throw and not to create failed scan node
            expectedThrow: false,
            expectedNodeName: undefined
        }
    ].forEach(test => {
        it('On file scan error - ' + test.name, () => {
            let bundle: FileScanBundle = {
                workspaceResults: new ScanResults('workspace'),
                rootNode: createRootTestNode('nowhere'),
                data: root.createEmptyScanResultsObject()
            } as FileScanBundle;
            if (test.expectedThrow || !test.withBundle) {
                assert.throws(() => DependencyUtils.onFileScanError(test.err, logManager, test.withBundle ? bundle : undefined), test.err);
            } else {
                let errorNode: FileTreeNode | undefined = DependencyUtils.onFileScanError(test.err, logManager, bundle);
                if (test.expectedNodeName) {
                    assert.isDefined(errorNode);
                    assert.include(errorNode?.name, test.expectedNodeName);
                    // make sure information is populated
                    assert.lengthOf(bundle.rootNode.children, 1);
                    assert.lengthOf(bundle.workspaceResults.failedFiles, 1);
                    assert.include(bundle.workspaceResults.failedFiles[0].name, test.expectedNodeName);
                } else {
                    assert.isUndefined(errorNode);
                }
            }
        });
    });
});
