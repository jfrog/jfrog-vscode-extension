import { assert } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { CveTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { IssueTreeNode } from '../../main/treeDataProviders/issuesTree/issueTreeNode';
import { Severity, SeverityUtils } from '../../main/types/severity';
import { createAndPopulateDependencyIssues, createDummyDependencyIssues, createDummyIssue, FileNodeTestCase } from './utils/treeNodeUtils.test';

describe('Descriptor Tree Tests', () => {
    /**
     * Test functionality of @class DescriptorTreeNode.
     */
    describe('Descriptor Node Tests', () => {
        let descriptorTestCases: any[] = [
            {
                test: 'No issues',
                data: { path: path.join('root', 'folder', 'path'), issues: [] }
            } as FileNodeTestCase,
            {
                test: 'One issue',
                data: { path: path.join('root', 'folder', 'path'), issues: [Severity.Medium] }
            } as FileNodeTestCase,
            {
                test: 'Multiple issues',
                data: {
                    path: path.join('root', 'folder', 'path'),
                    issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.NotApplicableHigh, Severity.High]
                }
            } as FileNodeTestCase
        ];

        descriptorTestCases.forEach(testCase => {
            it('Add node test - ' + testCase.test, () => {
                //let testNode: DescriptorTreeNode = new DescriptorTreeNode(testCase.data.path);
                // check order
            });
        });

        descriptorTestCases.forEach(testCase => {
            it('Get dependency by id test - ' + testCase.test, () => {
                //
            });
        });

        descriptorTestCases.forEach(testCase => {
            it('Get issue by id test - ' + testCase.test, () => {
                //
            });
        });

        descriptorTestCases.forEach(testCase => {
            it('timestamp test - ' + testCase.test, () => {
                //
            });
        });

        descriptorTestCases.forEach(testCase => {
            it('get all issues test - ' + testCase.test, () => {
                //
            });
        });
    });

    /**
     * Test functionality of @class DependencyIssuesTreeNode.
     */
    describe('Dependency With Issues Node Tests', () => {
        let dependencyTestCases: any[] = [
            {
                test: 'No issues',
                data: { name: 'component', version: '1.0.0', issues: [] },
                expectedSeverity: Severity.Unknown
            },
            {
                test: 'One issue',
                data: { name: 'component', version: '2.0.0', indirect: true, issues: [Severity.Low] },
                expectedSeverity: Severity.Low
            },
            {
                test: 'Multiple issues',
                data: {
                    name: 'component',
                    version: '4.2.1',
                    issues: [Severity.High, Severity.Low, Severity.NotApplicableMedium, Severity.NotApplicableLow, Severity.NotApplicableCritical]
                },
                expectedSeverity: Severity.High
            }
        ];

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
                    assert.include(testNode.tooltip, 'Artifact (indirect):\n' + testNode.artifactId);
                } else {
                    assert.include(testNode.tooltip, 'Artifact:\n' + testNode.artifactId);
                }
            });
        });
    });

    /**
     * Test functionality of @class CveTreeNode.
     */
    describe('CVE Issue Node Tests', () => {
        let cveTestCases: any[] = [];

        cveTestCases.forEach(testCase => {
            it('labelId test - ' + testCase.test, () => {
                //
            });
        });

        cveTestCases.forEach(testCase => {
            it('Get details page test - ' + testCase.test, () => {
                //
            });
        });
    });

    /**
     * Test functionality of @class LicenseIssueTreeNode.
     */
    describe('License Issue Node Tests', () => {
        let licenseTestCases: any[] = [];

        licenseTestCases.forEach(testCase => {
            it('Get details page test - ' + testCase.test, () => {
                //
            });
        });
    });
});
