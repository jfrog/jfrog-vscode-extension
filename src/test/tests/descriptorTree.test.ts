import { assert } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { CveTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { IssueTreeNode } from '../../main/treeDataProviders/issuesTree/issueTreeNode';
import { Severity, SeverityUtils } from '../../main/types/severity';
import {
    createAndPopulateDependencyIssues,
    createAndPopulateDescriptor,
    createDummyCveIssue,
    createDummyDependencyIssues,
    createDummyIssue,
    FileNodeTestCase
} from './utils/treeNodeUtils.test';

describe('Descriptor Tree Tests', () => {
    let dependencyTestCases: any[] = [
        {
            test: 'No issues',
            data: { name: 'componentA', version: '1.0.0', issues: [] },
            expectedSeverity: Severity.Unknown
        },
        {
            test: 'One issue',
            data: { name: 'componentB', version: '2.0.0', indirect: true, issues: [Severity.Low] },
            expectedSeverity: Severity.Low
        },
        {
            test: 'Multiple issues',
            data: {
                name: 'componentC',
                version: '4.2.1',
                issues: [Severity.High, Severity.Low, Severity.NotApplicableMedium, Severity.NotApplicableLow, Severity.NotApplicableCritical]
            },
            expectedSeverity: Severity.High
        }
    ];

    /**
     * Test functionality of @class DescriptorTreeNode.
     */
    describe('Descriptor Node Tests', () => {
        let descriptorTestCases: any[] = [
            {
                test: 'No dependencies',
                data: { path: path.join('root', 'folder', 'path'), issues: [] },
                expectedIssueCount: 0
            } as FileNodeTestCase,
            {
                test: 'One dependency',
                data: { path: path.join('root', 'folder', 'path'), issues: [dependencyTestCases[1].data] },
                expectedIssueCount: 1
            } as FileNodeTestCase,
            {
                test: 'Multiple dependencies',
                data: {
                    path: path.join('root', 'folder', 'path'),
                    issues: dependencyTestCases.map(testCase => testCase.data)
                },
                expectedIssueCount: 6
            } as FileNodeTestCase
        ];

        descriptorTestCases.forEach(testCase => {
            it('Add node test - ' + testCase.test, () => {
                let testNode: DescriptorTreeNode = new DescriptorTreeNode(testCase.data.path);
                for (let dependencyTestCase of testCase.data.issues) {
                    let newSize: number = testNode.dependenciesWithIssue.length + 1;
                    // Check trying to add new dependency (success) and dependency that exists already (no changes)
                    for (let i: number = 0; i < 2; i++) {
                        createDummyDependencyIssues(dependencyTestCase.name, dependencyTestCase.version, testNode, dependencyTestCase.indirect);
                        testNode.apply();
                        assert.lengthOf(testNode.dependenciesWithIssue, newSize);
                    }
                    // Check order
                    let prev: DependencyIssuesTreeNode | undefined;
                    for (let i: number = 0; i < testNode.dependenciesWithIssue.length; i++) {
                        if (prev) {
                            // Severity at least the same or less from prev
                            assert.isTrue(prev.severity >= testNode.dependenciesWithIssue[i].severity);
                            if (prev.severity === testNode.dependenciesWithIssue[i].severity) {
                                // Indirect/direct inner order
                                assert.isTrue((prev.indirect ? 0 : 1) >= (testNode.dependenciesWithIssue[i].indirect ? 0 : 1));
                                if ((prev.indirect ? 0 : 1) === (testNode.dependenciesWithIssue[i].indirect ? 0 : 1)) {
                                    // Number of issues at least the same or less from prev
                                    assert.isTrue(prev.issues.length >= testNode.dependenciesWithIssue[i].issues.length);
                                }
                            }
                        }
                        prev = testNode.dependenciesWithIssue[i];
                    }
                }
            });
        });

        descriptorTestCases.forEach(testCase => {
            it('Get dependency by id test - ' + testCase.test, () => {
                let testNode: DescriptorTreeNode = createAndPopulateDescriptor(testCase.data);
                // Search dependency not exist as child by artifactId and componentId
                assert.notExists(testNode.getDependencyByID('dummy' + '9.9.9'));
                assert.notExists(testNode.getDependencyByID('dummy:9.9.9'));
                // Add and search again
                let testDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '9.9.9', testNode);
                assert.deepEqual(testNode.getDependencyByID('dummy' + '9.9.9'), testDependency);
                assert.deepEqual(testNode.getDependencyByID('dummy:9.9.9'), testDependency);
            });
        });

        descriptorTestCases.forEach(testCase => {
            it('Get issue by id test - ' + testCase.test, () => {
                let testNode: DescriptorTreeNode = createAndPopulateDescriptor(testCase.data);
                let toSearchDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '9.9.9', testNode);
                let toSearchSecondDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy2', '2.2.2', testNode);
                // Search issue not exist as child
                let issueNoCVE: CveTreeNode = <CveTreeNode>createDummyIssue(Severity.Unknown);
                assert.deepEqual(testNode.getIssueById(issueNoCVE.issueId), []);
                // Add and search by issueId
                toSearchDependency.issues.push(issueNoCVE);
                assert.sameDeepMembers(<CveTreeNode[]>testNode.getIssueById(issueNoCVE.issueId), [issueNoCVE]);
                // Add and search by both CVE id and issue id
                let issueCVE: CveTreeNode = createDummyCveIssue(Severity.Unknown, toSearchDependency, 'test_cve_id');
                let issueCVEInSecondDependency: CveTreeNode = createDummyCveIssue(
                    Severity.Unknown,
                    toSearchSecondDependency,
                    'test_cve_id',
                    issueCVE.issueId
                );
                assert.sameDeepMembers(<CveTreeNode[]>testNode.getIssueById(issueCVE.issueId), [issueCVE, issueCVEInSecondDependency]);
                assert.sameDeepMembers(<CveTreeNode[]>testNode.getIssueById('test_cve_id'), [issueCVE, issueCVEInSecondDependency]);
            });
        });

        it('Timestamp test', () => {
            let testNode: DescriptorTreeNode = new DescriptorTreeNode('dummy');
            // No timestamp
            assert.isUndefined(testNode.timeStamp);
            // With dependencyScanTimeStamp
            testNode.dependencyScanTimeStamp = 2;
            assert.equal(testNode.timeStamp, 2);
            // With both timestamps, get lower
            testNode.applicableScanTimeStamp = 3;
            assert.equal(testNode.timeStamp, 2);
            testNode.dependencyScanTimeStamp = 1;
            assert.equal(testNode.timeStamp, 1);
            // With applicableScanTimeStamp
            testNode.dependencyScanTimeStamp = undefined;
            assert.equal(testNode.timeStamp, 3);
        });

        descriptorTestCases.forEach(testCase => {
            it('Get all issues test - ' + testCase.test, () => {
                let testNode: DescriptorTreeNode = createAndPopulateDescriptor(testCase.data);
                assert.lengthOf(testNode.issues, testCase.expectedIssueCount);
            });
        });
    });

    /**
     * Test functionality of @class DependencyIssuesTreeNode.
     */
    describe('Dependency With Issues Node Tests', () => {
        dependencyTestCases.forEach(testCase => {
            it('componentId test - ' + testCase.test, () => {
                let testNode: DependencyIssuesTreeNode = createAndPopulateDependencyIssues(testCase.data);
                assert.equal(testNode.componentId, testCase.data.name + ':' + testCase.data.version);
            });
        });

        dependencyTestCases.forEach(testCase => {
            it('Top severity test - ' + testCase.test, () => {
                let testNode: DependencyIssuesTreeNode = createAndPopulateDependencyIssues(testCase.data);
                assert.deepEqual(testNode.severity, testCase.expectedSeverity);
                assert.include(testNode.tooltip, 'Top severity: ' + SeverityUtils.getString(testCase.expectedSeverity));
                // Check order of issues
                let prev: IssueTreeNode | undefined;
                for (let i: number = 0; i < testNode.issues.length; i++) {
                    if (prev) {
                        // Severity at least the same or less from prev
                        assert.isTrue(prev.severity >= testNode.issues[i].severity);
                    }
                    prev = testNode.issues[i];
                }
            });
        });

        it('Collapsible state test', () => {
            let testNode: DependencyIssuesTreeNode = createDummyDependencyIssues('name', '1.0.0');
            // No issues, parent has only one child
            testNode.apply();
            assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            // One issue, parent has only one child
            testNode.issues.push(<CveTreeNode>createDummyIssue(Severity.Critical));
            testNode.apply();
            assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            // One issue, parent has multiple children
            createDummyDependencyIssues('name', '1.0.1', testNode.parent);
            testNode.apply();
            assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            // Multiple issues, parent has only one child
            let secondNode: DependencyIssuesTreeNode = createDummyDependencyIssues('name2', '1.0.0');
            secondNode.issues.push(<CveTreeNode>createDummyIssue(Severity.NotApplicableCritical));
            secondNode.issues.push(<CveTreeNode>createDummyIssue(Severity.NotApplicableCritical));
            secondNode.apply();
            assert.deepEqual(secondNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
        });

        dependencyTestCases.forEach(testCase => {
            it('Tooltip test - ' + testCase.test, () => {
                let testNode: DependencyIssuesTreeNode = createAndPopulateDependencyIssues(testCase.data);
                // Check issue count
                assert.equal(testNode.issues.length, testCase.data.issues.length);
                assert.include(testNode.tooltip, 'Issues count: ' + testNode.issues.length);
                // Check artifact information
                if (testNode.indirect) {
                    assert.include(testNode.tooltip, '\n(indirect)');
                } else {
                    assert.notInclude(testNode.tooltip, '\n(indirect)');
                }
            });
        });
    });

    it('CVE issue node, test labelId', () => {
        let toSearchDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '9.9.9');
        let issueNoCVE: CveTreeNode = createDummyCveIssue(Severity.Unknown, toSearchDependency);
        assert.equal(issueNoCVE.labelId, issueNoCVE.issueId);
        let issueCVE: CveTreeNode = createDummyCveIssue(Severity.Unknown, toSearchDependency, 'test_cve_id');
        assert.equal(issueCVE.labelId, issueCVE.cve?.cve);
    });
});
