import { assert } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { CveTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { Severity } from '../../main/types/severity';
import { createDummyDependencyIssues, createDummyIssue, FileNodeTestCase } from './utils/treeNodeUtils.test';

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
                data: { id: path.join('root', 'folder', 'path'), issues: [] }
            },
            {
                test: 'One issue',
                data: { path: path.join('root', 'folder', 'path'), issues: [Severity.Medium] }
            },
            {
                test: 'Multiple issues',
                data: {
                    path: path.join('root', 'folder', 'path'),
                    issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.NotApplicableHigh, Severity.High]
                }
            }
        ];

        dependencyTestCases.forEach(testCase => {
            it('componentId test - ' + testCase.test, () => {
                //
            });
        });

        dependencyTestCases.forEach(testCase => {
            it('Top severity test - ' + testCase.test, () => {
                // let testNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data);
                // assert.deepEqual(testNode.severity, testCase.expectedSeverity);
                // assert.include(testNode.tooltip, 'Top severity: ' + SeverityUtils.getString(testCase.expectedSeverity));
                // todo: check order of issues
            });
        });

        it('Collapsible state test', () => {
            let testNode: DependencyIssuesTreeNode = createDummyDependencyIssues('id');
            // No issues, parent has only one child
            testNode.apply();
            assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            // One issue, parent has only one child
            testNode.issues.push(<CveTreeNode>createDummyIssue(Severity.Critical));
            testNode.apply();
            assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
            // One issue, parent has multiple children
            createDummyDependencyIssues('id2',false,testNode.parent);
            testNode.apply();
            assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
            // Multiple issues, parent has only one child
            let secondNode: DependencyIssuesTreeNode = createDummyDependencyIssues('id3');
            secondNode.issues.push(<CveTreeNode>createDummyIssue(Severity.NotApplicableCritical));
            secondNode.issues.push(<CveTreeNode>createDummyIssue(Severity.NotApplicableCritical));
            secondNode.apply();
            assert.deepEqual(secondNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
        });

        dependencyTestCases.forEach(testCase => {
            it('Tooltip test - ' + testCase.test, () => {
                //
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
