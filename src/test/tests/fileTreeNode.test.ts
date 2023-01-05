import { assert } from 'chai';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { Severity } from '../../main/types/severity';
import { createTestNode, FileNodeTestCase, FileNodeTestData } from './utils/treeNodeUtils.test';

/**
 * Test functionality of @class FileTreeNode.
 */
describe('File Node Tests', () => {
    let testCases: FileNodeTestCase[] = [
        {
            test: 'No issues',
            data: { path: 'path', issues: [] },
            expectedSeverity: Severity.Unknown,
            expectedDescription: ''
        } as FileNodeTestCase,
        {
            test: 'One issue',
            data: { path: 'path', issues: [Severity.Medium] } as FileNodeTestData,
            expectedSeverity: Severity.Medium,
            expectedDescription: ''
        } as FileNodeTestCase,
        {
            test: 'Multiple issues',
            data: {
                path: 'path',
                issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.High]
            } as FileNodeTestData,
            expectedSeverity: Severity.High,
            expectedDescription: ''
        } as FileNodeTestCase
    ];

    testCases.forEach(testCase => {
        it('Top severity test - ' + testCase.test, () => {
            let testNode: FileTreeNode = createTestNode(testCase);
            assert.deepEqual(testNode.severity, testCase.expectedSeverity);
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
            //
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
