import * as path from 'path';
import { Severity } from '../../main/types/severity';
import { FileNodeTestCase } from './utils/treeNodeUtils.test';

describe('Descriptor Tree Tests', () => {
    /**
     * Test functionality of @class DescriptorTreeNode.
     */
    describe('Descriptor Node Tests', () => {
        let descriptorTestCases: any[] = [
            {
                test: 'No issues',
                data: { path: path.join('root', 'folder', 'path'), issues: [] },
                expectedSeverity: Severity.Unknown
            } as FileNodeTestCase,
            {
                test: 'One issue',
                data: { path: path.join('root', 'folder', 'path'), issues: [Severity.Medium] },
                expectedSeverity: Severity.Medium
            } as FileNodeTestCase,
            {
                test: 'Multiple issues',
                data: {
                    path: path.join('root', 'folder', 'path'),
                    issues: [Severity.Low, Severity.Low, Severity.NotApplicableCritical, Severity.NotApplicableHigh, Severity.High]
                },
                expectedSeverity: Severity.High
            } as FileNodeTestCase
        ];

        descriptorTestCases.forEach(testCase => {
            it('Add node test - ' + testCase.test, () => {
                //
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
        let dependencyTestCases: any[] = [];

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

        dependencyTestCases.forEach(testCase => {
            it('Collapsible state test - ' + testCase.test, () => {
                //
            });
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
