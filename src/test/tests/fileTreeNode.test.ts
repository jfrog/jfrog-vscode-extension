import * as vscode from 'vscode';
import { assert } from 'chai';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { Severity, SeverityUtils } from '../../main/types/severity';
import { createTestNode, FileNodeTestCase, FileNodeTestData } from './utils/treeNodeUtils.test';
import { Utils } from '../../main/treeDataProviders/utils/utils';

/**
 * Test functionality of @class FileTreeNode.
 */
describe('File Node Tests', () => {
    let testCases: any[] = [
        {
            test: 'No issues',
            data: { path: '/root/folder/path', issues: [] },
            expectedSeverity: Severity.Unknown,
            expectedDescription: ''
        } as FileNodeTestCase,
        {
            test: 'One issue',
            data: { path: '/root/folder/path', issues: [Severity.Medium] } as FileNodeTestData,
            expectedSeverity: Severity.Medium,
            expectedDescription: ''
        } as FileNodeTestCase,
        {
            test: 'Multiple issues',
            data: {
                path: '/root/folder/path',
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
        it('label/name test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createTestNode(testCase);
            assert.equal(testNode.name, Utils.getLastSegment(testCase.data.path));
            assert.equal(testNode.label, Utils.getLastSegment(testCase.data.path));
        });
    });

    testCases.forEach(testCase => {
        it('Description test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createTestNode(testCase);
            // No parent
            assert.equal(testNode.description,testNode.fullPath);
            // Local path not in parent path
            testNode.parent = new IssuesRootTreeNode({uri: { fsPath: "nowhere"} as vscode.Uri } as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description,testNode.fullPath);
            // file in root
            testNode.parent = new IssuesRootTreeNode({ uri: { fsPath: "/root/folder"} as vscode.Uri } as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description,undefined);
            // Parent in path and file not in root
            testNode.parent = new IssuesRootTreeNode({ uri: { fsPath: "/root"} as vscode.Uri } as vscode.WorkspaceFolder);
            testNode.apply();
            assert.equal(testNode.description,"./folder/path");
        });
    });

    testCases.forEach(testCase => {
        it('Collapsible state test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('Tooltip test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createTestNode(testCase);
            assert.equal(testNode.fullPath,testCase.data.path);
            assert.include(testNode.tooltip, "Full path: " + testNode.fullPath);
            assert.equal(testNode.issues.length,testCase.data.issues.length);
            assert.include(testNode.tooltip, "Issues count: " + testNode.issues.length);
            // timestamp - not set
            assert.notInclude(testNode.tooltip, "Last scan completed at");
            testNode.timeStamp = Date.now();
            testNode.apply();
            assert.include(testNode.tooltip, "Last scan completed at");
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
