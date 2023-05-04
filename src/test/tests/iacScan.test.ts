import * as path from 'path';

import { assert } from 'chai';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { IacFileIssues, IacIssue, IacRunner, IacScanResponse } from '../../main/scanLogic/scanRunners/iacScan';
import { ScanUtils } from '../../main/utils/scanUtils';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { createRootTestNode, getTestCodeFileNode } from './utils/treeNodeUtils.test';
import { ScanResults } from '../../main/types/workspaceIssuesDetails';
import { AnalyzerUtils } from '../../main/treeDataProviders/utils/analyzerUtils';
import { getAnalyzerScanResponse } from './utils/utils.test';
import { FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import { IacTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/iacTreeNode';
import { CodeIssueTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';

describe('Iac Scan Tests', () => {
    const scanIac: string = path.join(__dirname, '..', 'resources', 'iacScan');
    let logManager: LogManager = new LogManager().activate();

    describe('Iac scan fails', () => {
        let response: IacScanResponse;

        before(() => {
            response = getDummyRunner().generateScanResponse(undefined);
        });

        it('Check response defined', () => {
            assert.isDefined(response);
        });

        it('Check response attributes are not exist', () => {
            assert.isUndefined(response.filesWithIssues);
        });
    });

    describe('Populate Iac information tests', () => {
        const testRoot: IssuesRootTreeNode = createRootTestNode('root');
        let expectedScanResult: ScanResults;
        let populatedIssues: number;

        before(() => {
            // Read test data and populate scanResult
            let response: IacScanResponse = getDummyRunner().generateScanResponse(
                getAnalyzerScanResponse(path.join(scanIac, 'analyzerResponse.json'))
            );
            expectedScanResult = {
                iacScanTimestamp: 11,
                iacScan: response
            } as ScanResults;
            // Populate scan result information to the test dummy node
            populatedIssues = AnalyzerUtils.populateIacIssues(testRoot, expectedScanResult);
        });

        it('Check issue count returned from method', () => {
            assert.equal(populatedIssues, 3);
        });

        it('Check timestamp transferred from data to node', () => {
            assert.equal(expectedScanResult.iacScanTimestamp, testRoot.iacScanTimeStamp);
        });

        describe('Data populated as CodeFileTreeNode nodes', () => {
            let expectedFilesWithIssues: IacFileIssues[] = [];

            before(() => {
                // Collect all the locations from the test data with issues under the same file to be together under the same data
                expectedScanResult.iacScan.filesWithIssues.forEach((fileWithIssue: IacFileIssues) => {
                    let fileIssues: IacFileIssues | undefined = expectedFilesWithIssues.find(
                        (fileIssues: IacFileIssues) => fileIssues.full_path === fileWithIssue.full_path
                    );
                    if (!fileIssues) {
                        fileIssues = {
                            full_path: fileWithIssue.full_path,
                            issues: []
                        } as IacFileIssues;
                        expectedFilesWithIssues.push(fileIssues);
                    }
                    fileWithIssue.issues.forEach((issue: IacIssue) => {
                        let iacIssue: IacIssue | undefined = fileIssues?.issues.find((iacIssue: IacIssue) => iacIssue.ruleId === issue.ruleId);
                        if (!iacIssue) {
                            iacIssue = {
                                ruleId: issue.ruleId,
                                fullDescription: issue.fullDescription,
                                ruleName: issue.ruleName,
                                severity: issue.severity,
                                locations: []
                            } as IacIssue;
                            fileIssues?.issues.push(iacIssue);
                        }
                        iacIssue?.locations.push(...issue.locations);
                    });
                });
            });

            it('Check file nodes created for each file with issues', () => {
                expectedFilesWithIssues.forEach((fileIssues: IacFileIssues) => {
                    assert.isDefined(getTestCodeFileNode(testRoot, fileIssues.full_path));
                });
            });

            it('Check number of file nodes populated as root children', () => {
                assert.equal(
                    testRoot.children.length,
                    expectedFilesWithIssues.length,
                    'files populated: ' + testRoot.children.map(child => child.label)
                );
            });

            describe('Issues populated as IacTreeNode nodes', () => {
                function getTestIssueNode(fileNode: CodeFileTreeNode, location: FileRegion): IacTreeNode {
                    let issueLocation: CodeIssueTreeNode | undefined = fileNode.issues.find(
                        issue =>
                            // Location in vscode start from 0, in scanners location starts from 1
                            issue.regionWithIssue.start.line === location.startLine - 1 &&
                            issue.regionWithIssue.end.line === location.endLine - 1 &&
                            issue.regionWithIssue.start.character === location.startColumn - 1 &&
                            issue.regionWithIssue.end.character === location.endColumn - 1
                    );
                    assert.instanceOf(
                        issueLocation,
                        IacTreeNode,
                        'expected node to be IacTreeNode issue for location ' + location + ' in node: ' + issueLocation
                    );
                    return <IacTreeNode>issueLocation;
                }

                it('Check number of issues populated in file', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: IacFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                            assert.equal(fileNode.getIssueById(expectedIacIssues.ruleId).length, expectedIacIssues.locations.length);
                        });
                    });
                });

                it('Check Iac issue in location nodes created in the file node', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: IacFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.isDefined(getTestIssueNode(fileNode, expectedLocation));
                            });
                        });
                    });
                });

                it('Check rule names transferred as label of the issues', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: IacFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).label, expectedIacIssues.ruleName);
                            });
                        });
                    });
                });

                it('Check rule full description transferred', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: IacFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).fullDescription, expectedIacIssues.fullDescription);
                            });
                        });
                    });
                });

                it('Check snippet text at location with issue transferred', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: IacFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).snippet, expectedLocation.snippet?.text);
                            });
                        });
                    });
                });

                it('Check issue severity transferred', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: IacFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: IacIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).severity, expectedIacIssues.severity);
                            });
                        });
                    });
                });
            });
        });
    });

    function getDummyRunner(): IacRunner {
        return new IacRunner({} as ConnectionManager, ScanUtils.ANALYZER_TIMEOUT_MILLISECS, logManager);
    }
});
