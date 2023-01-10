import { assert } from 'chai';
import * as path from 'path';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { Severity } from '../../main/types/severity';
import { createAndPopulateFileTestNode, createRootTestNode, RootNodeTestCase } from './utils/treeNodeUtils.test';

/**
 * Test functionality of @class IssuesRootTreeNode.
 */
describe('Issues Root Node Tests', () => {
    let testCases: any[] = [
        {
            test: 'No files',
            path: path.join('root'),
            data: [{ path: path.join('root', 'folder', 'path'), issues: [] }],
            expectedSeverity: Severity.Unknown
        } as RootNodeTestCase,
        {
            test: 'One file',
            path: path.join('root'),
            data: [{ path: path.join('root', 'folder', 'path'), issues: [Severity.Medium] }],
            expectedSeverity: Severity.Medium
        } as RootNodeTestCase,
        {
            test: 'Multiple files',
            path: path.join('root'),
            data: [
                {
                    path: path.join('root', 'folder', 'path'),
                    issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.NotApplicableHigh, Severity.High]
                }
            ],
            expectedSeverity: Severity.High
        } as RootNodeTestCase
    ];

    testCases.forEach(testCase => {
        it('Add child test - ' + testCase.test, () => {
            let testNode: IssuesRootTreeNode = createRootTestNode(testCase.path);
            for (let i: number = 0; i < testCase.data.length; i++) {
                let fileNode: FileTreeNode = createAndPopulateFileTestNode(testCase.data[i]);
                assert.lengthOf(testNode.children,i);
                testNode.addChild(fileNode);
                assert.lengthOf(testNode.children,i + 1);
                assert.include(testNode.children,fileNode);
                assert.deepEqual(fileNode.parent,testNode);
            }
        });
    });

    testCases.forEach(testCase => {
        it('title/description test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('oldest timestamp test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('Tooltip test - ' + testCase.test, () => {
            //
        });
    });
});
