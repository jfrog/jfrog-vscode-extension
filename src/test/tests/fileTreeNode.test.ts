import * as vscode from 'vscode';
import { assert } from 'chai';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { Severity, SeverityUtils } from '../../main/types/severity';
import { createTestNode, FileNodeTestCase, FileNodeTestData } from './utils/treeNodeUtils.test';

/**
 * Test functionality of @class FileTreeNode.
 */
describe('File Node Tests', () => {
    let testCases: any[] = [
        {
            test: 'No issues',
            data: { path: 'folder/path', issues: [] },
            expectedSeverity: Severity.Unknown,
            expectedDescription: ''
        } as FileNodeTestCase,
        {
            test: 'One issue',
            data: { path: 'folder/path', issues: [Severity.Medium] } as FileNodeTestData,
            expectedSeverity: Severity.Medium,
            expectedDescription: ''
        } as FileNodeTestCase,
        {
            test: 'Multiple issues',
            data: {
                path: 'folder/path',
                issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.NotApplicableHigh, Severity.High]
            } as FileNodeTestData,
            expectedSeverity: Severity.High,
            expectedDescription: ''
        } as FileNodeTestCase
    ];

    testCases.forEach(testCase => {
        it('Top severity test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createTestNode(testCase);
            assert.deepEqual(testNode.severity, testCase.expectedSeverity);
            assert.include(testNode.tooltip, "Top severity: " + SeverityUtils.getString(testCase.expectedSeverity));
        });
    });

    testCases.forEach(testCase => {
        it('Get issue by id test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('label test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('Description test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createTestNode(testCase);
            // Before parent
            assert.equal(testNode.description,testNode.fullPath);
            // Parent not in path
            testNode.parent = new IssuesRootTreeNode({} as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description,testNode.fullPath);
            // Parent in path
            testNode.parent = new IssuesRootTreeNode({ uri: { fsPath: "folder" } as vscode.Uri } as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description,"./path");
        });
    });

    testCases.forEach(testCase => {
        it('Collapsible state test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('Tooltip test - ' + testCase.test, () => {
            // issues count
            // timestamp
            // top severity
        });
    });

    [
        {
            test: 'Failed node without reason',
            data: FileTreeNode.createFailedScanNode('folder/path'),
            expectedName: 'path - [Fail to scan]'
        },
        {
            test: 'Failed node with reason',
            data: FileTreeNode.createFailedScanNode('path', 'reason'),
            expectedName: 'path - reason'
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
