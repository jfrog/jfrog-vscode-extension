import * as vscode from 'vscode';
import * as path from 'path';

import { assert } from 'chai';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { Severity, SeverityUtils } from '../../main/types/severity';
import { createAndPopulateFileTestNode, createDummyIssue, createFileTestNode, FileNodeTestCase, FileNodeTestData } from './utils/treeNodeUtils.test';
import { Utils } from '../../main/treeDataProviders/utils/utils';
import { IssueTreeNode } from '../../main/treeDataProviders/issuesTree/issueTreeNode';

/**
 * Test functionality of @class FileTreeNode.
 */
describe('File Node Tests', () => {
    let testCases: any[] = [
        {
            test: 'No issues',
            data: { path: path.join('root', 'folder', 'path'), issues: [] },
            expectedSeverity: Severity.Unknown
        } as FileNodeTestCase,
        {
            test: 'One issue',
            data: { path: path.join('root', 'folder', 'path'), issues: [Severity.Medium] } as FileNodeTestData,
            expectedSeverity: Severity.Medium
        } as FileNodeTestCase,
        {
            test: 'Multiple issues',
            data: {
                path: path.join('root', 'folder', 'path'),
                issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.NotApplicableHigh, Severity.High]
            } as FileNodeTestData,
            expectedSeverity: Severity.High
        } as FileNodeTestCase
    ];

    testCases.forEach(testCase => {
        it('Top severity test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data);
            assert.deepEqual(testNode.severity, testCase.expectedSeverity);
            assert.include(testNode.tooltip, 'Top severity: ' + SeverityUtils.getString(testCase.expectedSeverity));
        });
    });

    testCases.forEach(testCase => {
        it('Get issue by id test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data);
            let toSearchIssue: IssueTreeNode = createDummyIssue(Severity.Unknown);
            // Search issue not exist as child
            assert.deepEqual(testNode.getIssueById(toSearchIssue.issueId), []);
            // Add and search
            for (let i: number = 1; i < 3; i++) {
                testNode.issues.push(toSearchIssue);
                testNode.apply();
                let found: IssueTreeNode[] | undefined = testNode.getIssueById(toSearchIssue.issueId);
                assert.exists(found);
                let issues: IssueTreeNode[] = <IssueTreeNode[]>found;
                assert.lengthOf(issues, i);
                for (let issue of issues) {
                    assert.deepEqual(issue, toSearchIssue);
                }
            }
        });
    });

    testCases.forEach(testCase => {
        it('label/name test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data);
            assert.equal(testNode.name, Utils.getLastSegment(testCase.data.path));
            assert.equal(testNode.label, Utils.getLastSegment(testCase.data.path));
        });
    });

    testCases.forEach(testCase => {
        it('Description test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data);
            // No parent
            assert.equal(testNode.description, testNode.projectFilePath);
            // Local path not in parent path
            testNode.parent = new IssuesRootTreeNode({ uri: { fsPath: path.join('nowhere') } as vscode.Uri } as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description, testNode.projectFilePath);
            // Parent in path, parent is root
            testNode.parent = new IssuesRootTreeNode({ uri: { fsPath: path.join('root', 'folder') } as vscode.Uri } as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description, undefined);
            // Parent in path and parent is not root
            testNode.parent = new IssuesRootTreeNode({ uri: { fsPath: path.join('root') } as vscode.Uri } as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description, './' + path.join('folder', 'path'));
        });
    });

    it('Collapsible state test', () => {
        let testNode: FileTreeNode = createFileTestNode('path');
        // No issues, no parent
        testNode.apply();
        assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.None);
        // One issue, no parent
        testNode.issues.push(createDummyIssue(Severity.Critical));
        testNode.apply();
        assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
        // One issue, with parent
        new IssuesRootTreeNode({ uri: { fsPath: 'nowhere' } as vscode.Uri } as vscode.WorkspaceFolder).addChildAndApply(testNode);
        assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        // Multiple issues, with parent
        testNode.issues.push(createDummyIssue(Severity.NotApplicableCritical));
        testNode.apply();
        assert.deepEqual(testNode.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    testCases.forEach(testCase => {
        it('Tooltip test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data);
            // Check path
            assert.equal(testNode.projectFilePath, testCase.data.path);
            assert.include(testNode.tooltip, 'Full path: ' + testNode.projectFilePath);
            // Check issue count
            assert.equal(testNode.issues.length, testCase.data.issues.length);
            assert.include(testNode.tooltip, 'Issues count: ' + testNode.issues.length);
            // Check timestamp
            assert.notInclude(testNode.tooltip, 'Last scan completed at');
            testNode.timeStamp = Date.now();
            testNode.apply();
            assert.include(testNode.tooltip, 'Last scan completed at');
        });
    });

    [
        {
            test: 'Failed node without reason',
            data: FileTreeNode.createFailedScanNode(path.join('folder', 'path')),
            expectedName: 'path - [Fail to scan]'
        },
        {
            test: 'Failed node with reason',
            data: FileTreeNode.createFailedScanNode('path', '[reason]'),
            expectedName: 'path - [reason]'
        }
    ].forEach(testCase => {
        it(testCase.test, () => {
            // Before apply
            assert.exists(testCase.data);
            assert.deepEqual(testCase.data.severity, Severity.Unknown);
            assert.equal(testCase.data.name, testCase.expectedName);
            // After apply
            testCase.data.apply();
            assert.equal(testCase.data.name, testCase.expectedName);
        });
    });
});
