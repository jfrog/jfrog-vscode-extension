import * as path from 'path';

import { assert } from 'chai';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { IacRunner, IacScanResponse } from '../../main/scanLogic/scanRunners/iacScan';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { createRootTestNode, getTestCodeFileNode } from './utils/treeNodeUtils.test';
import { ScanResults } from '../../main/types/workspaceIssuesDetails';
import { AnalyzerUtils, FileWithSecurityIssues, SecurityIssue } from '../../main/treeDataProviders/utils/analyzerUtils';
import { getAnalyzerScanResponse, getEmptyAnalyzerScanResponse } from './utils/utils.test';
import { FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import { IacTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/iacTreeNode';
import { CodeIssueTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { groupFiles, testDataAndViewFromScanResponse } from './utils/testAnalyzer.test';

describe('Iac Scan Tests', () => {
    const scanIac: string = path.join(__dirname, '..', 'resources', 'iacScan');
    let logManager: LogManager = new LogManager().activate();

    describe('Iac scan fails', () => {
        let response: IacScanResponse;

        before(() => {
            response = getDummyRunner().convertResponse(undefined);
        });

        it('Check response defined', () => {
            assert.isDefined(response);
        });

        it('Check response attributes are not exist', () => {
            assert.isUndefined(response.filesWithIssues);
        });
    });

    describe('Iac scan no issues found', () => {
        let response: IacScanResponse;

        before(() => {
            response = getDummyRunner().convertResponse(getEmptyAnalyzerScanResponse());
        });

        it('Check response defined', () => {
            assert.isDefined(response);
        });

        it('Check response attributes exist', () => {
            assert.isDefined(response.filesWithIssues);
        });
    });

    describe('Iac scan success', () => {
        const testRoot: IssuesRootTreeNode = createRootTestNode('root');
        let expectedScanResult: ScanResults;
        let populatedIssues: number;

        before(() => {
            // Read test data and populate scanResult
            let response: IacScanResponse = getDummyRunner().convertResponse(getAnalyzerScanResponse(path.join(scanIac, 'analyzerResponse.json')));
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

            let expectedFilesWithIssues: FileWithSecurityIssues[] = [];

            before(() => {
                expectedFilesWithIssues = groupFiles(expectedScanResult.secretsScan);
                testDataAndViewFromScanResponse(testRoot, expectedFilesWithIssues, getTestIssueNode);
            });

            it('Check rule full description transferred', () => {
                expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
                    let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                    expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
                        expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                            assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).fullDescription, expectedIssues.fullDescription);
                        });
                    });
                });
            });

            it('Check snippet text at location with issue transferred', () => {
                expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
                    let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                    expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
                        expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                            assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).snippet, expectedLocation.snippet?.text);
                        });
                    });
                });
            });
        });
    });

    function getDummyRunner(): IacRunner {
        return new IacRunner({} as ConnectionManager, logManager);
    }
});
