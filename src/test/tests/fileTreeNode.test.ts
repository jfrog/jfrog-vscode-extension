import * as vscode from 'vscode';
import * as path from 'path';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { assert } from 'chai';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { Severity } from '../../main/types/severity';

/**
 * Test functionality of @class FileTreeNode.
 */
describe('File Node Tests', () => {
    let testWorkspace: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file(path.join(__dirname, '..', 'resources')),
        name: 'pom.xml-test',
        index: 0
    } as vscode.WorkspaceFolder;
    let root: IssuesRootTreeNode;

    let testCases: any[] = [
        {
            test: 'No issues',
            data: { path: 'path', issues: [] },
            expectedSeverity: Severity.Unknown,
            expectedDescription: ""
        },
        {
            test: 'One issue',
            data: { path: 'path', issues: [Severity.Low] },
            expectedSeverity: Severity.Low,
            expectedDescription: ""
        },
        {
            test: 'Multiple issues',
            data: { path: 'path', issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.High] },
            expectedSeverity: Severity.High,
            expectedDescription: ""
        }
    ];
    
    beforeEach(() => {
        root = new IssuesRootTreeNode(testWorkspace);
    });

    testCases.forEach(testCase => {
        it('Top severity test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('Get issue by id test - ' + testCase.test, () => {
            //
        });
    });

    testCases.forEach(testCase => {
        it('label test - ' + testCase.test, () => {
            // include test on tooltip (full path)
        });
    });

    testCases.forEach(testCase => {
        it('Description test - ' + testCase.test, () => {
            // include test on tooltip (full path)
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
            assert.exists(testCase.data);
            assert.deepEqual(testCase.data.severity, Severity.Unknown);

            assert.equal(testCase.data.name, testCase.expectedName);
            root.addChild(testCase.data);
            root.apply();
            assert.equal(testCase.data.name, testCase.expectedName);
        });
    });

});
