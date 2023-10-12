import { assert } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { Severity } from '../../main/types/severity';
import {
    createAndPopulateFileTestNode,
    createAndPopulateRootTestNode,
    createRootTestNode,
    FileNodeTestData,
    RootNodeTestCase
} from './utils/treeNodeUtils.test';

/**
 * Test functionality of @class IssuesRootTreeNode.
 */
describe('Issues Root Node Tests', () => {
    let testCases: any[] = [
        {
            test: 'No files',
            path: 'root',
            data: [],
            expectedIssueCount: 0
        } as RootNodeTestCase,
        {
            test: 'One file',
            path: 'root',
            data: [{ path: path.join('root', 'path'), issues: [Severity.Medium] }],
            expectedIssueCount: 1
        } as RootNodeTestCase,
        {
            test: 'Multiple files',
            path: 'root',
            data: [
                {
                    path: path.join('root', 'folder', 'path1'),
                    issues: []
                },
                {
                    path: path.join('root', 'folder', 'path2'),
                    issues: [Severity.Critical]
                },
                {
                    path: path.join('root', 'path3'),
                    issues: [Severity.Medium, Severity.Medium]
                },
                {
                    path: path.join('root', 'folder', 'path4'),
                    issues: [Severity.Low, Severity.NotApplicableCritical, Severity.NotApplicableHigh, Severity.High]
                }
            ] as FileNodeTestData[],
            expectedIssueCount: 7
        } as RootNodeTestCase
    ];

    testCases.forEach(testCase => {
        it('Add child test - ' + testCase.test, () => {
            let testNode: IssuesRootTreeNode = createRootTestNode(testCase.path);
            for (let i: number = 0; i < testCase.data.length; i++) {
                let fileNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data[i]);
                assert.lengthOf(testNode.children, i);
                // Add new child
                testNode.addChildAndApply(fileNode);
                assert.lengthOf(testNode.children, i + 1);
                assert.include(testNode.children, fileNode);
                assert.deepEqual(fileNode.parent, testNode);
                // Make sure files are ordered
                let prev: FileTreeNode | undefined;
                for (let i: number = 0; i < testNode.children.length; i++) {
                    if (prev) {
                        // Severity at least the same or less from prev
                        assert.isTrue(prev.severity >= testNode.children[i].severity);
                        if (prev.severity === testNode.children[i].severity) {
                            // Number of issues at least the same or less from prev
                            assert.isTrue(prev.issues.length >= testNode.children[i].issues.length);
                        }
                    }
                    prev = testNode.children[i];
                }
            }
        });
    });

    testCases.forEach(testCase => {
        it('Oldest timestamp test - ' + testCase.test, () => {
            let testNode: IssuesRootTreeNode = createAndPopulateRootTestNode(testCase.path, testCase.data);
            // No timestamp
            assert.isUndefined(testNode.oldestScanTimestamp);
            assert.notInclude(testNode.tooltip, 'Last scanned at');
            if (testNode.children.length > 0) {
                // With timestamp
                for (let i: number = 0; i < testNode.children.length; i++) {
                    testNode.children[i].timeStamp = i + 1;
                }
                testNode.apply();
                assert.equal(testNode.oldestScanTimestamp, 1);
                assert.include(testNode.tooltip, 'Last scanned at');
                // Override with status
                testNode.title = 'title';
                testNode.apply();
                assert.notInclude(testNode.tooltip, 'Last scanned at');
            }
        });
    });

    testCases.forEach(testCase => {
        it('Tooltip test - ' + testCase.test, () => {
            let testNode: IssuesRootTreeNode = createAndPopulateRootTestNode(testCase.path, testCase.data);
            // Path
            assert.equal(testNode.workspace.uri.fsPath, testCase.path);
            assert.include(testNode.tooltip, 'Full path: ' + testCase.path);
            // Issue count
            assert.include(testNode.tooltip, 'Issue count: ' + testCase.expectedIssueCount);
        });
    });

    it('Title and description test', () => {
        // No title
        let testNode: IssuesRootTreeNode = createRootTestNode(path.join('root'));
        testNode.apply();
        assert.equal(testNode.description, '');
        assert.notInclude(testNode.tooltip, 'Status:');
        // With title
        testNode = new IssuesRootTreeNode({ uri: { fsPath: path.join('root') } as vscode.Uri } as vscode.WorkspaceFolder, 'title');
        assert.equal(testNode.description, 'title');
        testNode.title = 'other title';
        assert.equal(testNode.description, 'other title');
        testNode.apply();
        assert.include(testNode.tooltip, 'Status: other title');
    });

    it('Get file tree node test', () => {
        const testNode: IssuesRootTreeNode = createAndPopulateRootTestNode(testCases[1].path, testCases[1].data);
        testNode.apply();
        const expectedTree: FileTreeNode | undefined = testNode.getFileTreeNode(path.join('root', 'path'));
        assert.equal(expectedTree?.name, 'path');
    });
});
