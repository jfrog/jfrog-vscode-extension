import { assert } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { CveTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { IssueTreeNode } from '../../main/treeDataProviders/issuesTree/issueTreeNode';
import { Severity, SeverityUtils } from '../../main/types/severity';
import { createAndPopulateDependencyIssues, createDummyDependencyIssues, createDummyIssue, FileNodeTestCase } from './utils/treeNodeUtils.test';

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
                data: { path: path.join('root', 'folder', 'path'), issues: [] }
            } as FileNodeTestCase,
            {
                test: 'One dependency',
                data: { path: path.join('root', 'folder', 'path'), issues: [dependencyTestCases[1]] }
            } as FileNodeTestCase,
            {
                test: 'Multiple dependencies',
                data: {
                    path: path.join('root', 'folder', 'path'),
                    issues: dependencyTestCases
                }
            } as FileNodeTestCase
        ];

        descriptorTestCases.forEach(testCase => {
            it('Add node test - ' + testCase.test, () => {
                let testNode: DescriptorTreeNode = new DescriptorTreeNode(testCase.data.path);
                for (let dependencyTestCase of testCase.data.issues) {
                    let newSize: number = testNode.dependenciesWithIssue.length + 1;
                    // Check trying to add new dependency (success) and dependency that exists already (no changes)
                    for (let i: number = 0; i < 2; i++) {
                        createDummyDependencyIssues(
                            dependencyTestCase.data.name,
                            dependencyTestCase.data.version,
                            testNode,
                            dependencyTestCase.data.indirect
                        );
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
