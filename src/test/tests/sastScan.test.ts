import * as path from 'path';

import { assert } from 'chai';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import { SastRunner, SastScanResponse } from '../../main/scanLogic/scanRunners/sastScan';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { SastTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/sastTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils, FileWithSecurityIssues } from '../../main/treeDataProviders/utils/analyzerUtils';
import { ScanResults } from '../../main/types/workspaceIssuesDetails';
import { AppsConfigModule } from '../../main/utils/jfrogAppsConfig/jfrogAppsConfig';
import {
    assertFileNodesCreated,
    assertIssueNodesCreated,
    assertIssuesFullDescription,
    assertIssuesSnippet,
    assertNodeLabelRuleName,
    assertNodesSeverity,
    assertSameNumberOfFileNodes,
    assertSameNumberOfIssueNodes,
    findLocationNode,
    groupFiles
} from './utils/testAnalyzer.test';
import { createRootTestNode } from './utils/treeNodeUtils.test';
import { createTestStepProgress, getAnalyzerScanResponse, getEmptyAnalyzerScanResponse } from './utils/utils.test';
import { AnalyzerManager } from '../../main/scanLogic/scanRunners/analyzerManager';

describe('Sast Tests', () => {
    const scanSast: string = path.join(__dirname, '..', 'resources', 'sastScan');
    let logManager: LogManager = new LogManager().activate();

    describe('Sast scan fails', () => {
        let response: SastScanResponse;

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

    describe('Sast scan no issues found', () => {
        let response: SastScanResponse;

        before(() => {
            response = getDummyRunner().generateScanResponse(getEmptyAnalyzerScanResponse());
        });

        it('Check response defined', () => {
            assert.isDefined(response);
        });

        it('Check response attributes exist', () => {
            assert.isDefined(response.filesWithIssues);
        });
    });

    describe('Sast scan success', () => {
        const testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
        let expectedScanResult: ScanResults;
        let expectedFilesWithIssues: FileWithSecurityIssues[] = [];
        let populatedIssues: number;

        before(() => {
            // Read test data and populate scanResult
            let response: SastScanResponse = getDummyRunner().generateScanResponse(
                getAnalyzerScanResponse(path.join(scanSast, 'analyzerResponse.json'))
            );
            expectedFilesWithIssues = groupFiles(response);
            expectedScanResult = {
                sastScanTimestamp: 22,
                sastScan: response
            } as ScanResults;
            // Populate scan result information to the test dummy node
            populatedIssues = AnalyzerUtils.populateSastIssues(testRoot, expectedScanResult);
        });

        it('Check issue count returned from method', () => {
            assert.equal(populatedIssues, 1);
        });

        it('Check timestamp transferred from data to node', () => {
            assert.equal(expectedScanResult.sastScanTimestamp, testRoot.sastScanTimeStamp);
        });

        describe('Data populated as CodeFileTreeNode nodes', () => {
            function getTestIssueNode(fileNode: CodeFileTreeNode, location: FileRegion): SastTreeNode {
                let issueLocation: CodeIssueTreeNode | undefined = findLocationNode(location, fileNode);
                if (!(issueLocation instanceof SastTreeNode)) {
                    assert.fail('expected node to be SastTreeNode issue for location ' + location + ' in node: ' + issueLocation);
                }
                return <SastTreeNode>issueLocation;
            }

            it('Check file nodes created for each file with issues', () => assertFileNodesCreated(testRoot, expectedFilesWithIssues));

            it('Check number of file nodes populated as root children', () => assertSameNumberOfFileNodes(testRoot, expectedFilesWithIssues));

            describe('Issues populated as nodes', () => {
                it('Check number of issues populated in file', () => assertSameNumberOfIssueNodes(testRoot, expectedFilesWithIssues));

                it('Check issue nodes created in the file node', () => assertIssueNodesCreated(testRoot, expectedFilesWithIssues, getTestIssueNode));

                it('Check rule names transferred as labels', () => assertNodeLabelRuleName(testRoot, expectedFilesWithIssues, getTestIssueNode));

                it('Check issue severity transferred', () => assertNodesSeverity(testRoot, expectedFilesWithIssues, getTestIssueNode));

                it('Check rule full description transferred', () => assertIssuesFullDescription(testRoot, expectedFilesWithIssues, getTestIssueNode));

                it('Check snippet text at location transferred', () => assertIssuesSnippet(testRoot, expectedFilesWithIssues, getTestIssueNode));
            });
        });
    });

    function getDummyRunner(): SastRunner {
        return new SastRunner(
            {} as ScanResults,
            createRootTestNode(''),
            createTestStepProgress(),
            {} as ConnectionManager,
            logManager,
            new AppsConfigModule(''),
            {} as AnalyzerManager
        );
    }

    describe('Empty/Invalid location.physicalLocation validation tests for generateCodeFlowData', () => {
        let runner: SastRunner;

        beforeEach(() => {
            runner = getDummyRunner();
        });

        it('Should handle invalid physicalLocation scenarios in threadFlow without errors', () => {
            const filePath: string = '/test/file.js';
            const issueLocation: any = {
                region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
            } as any;

            const codeFlows: any = [
                {
                    threadFlows: [
                        {
                            locations: [
                                { location: { physicalLocation: null } },
                                { location: { physicalLocation: undefined } },
                                {
                                    location: {
                                        physicalLocation: {
                                            artifactLocation: null,
                                            region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
                                        }
                                    }
                                },
                                {
                                    location: {
                                        physicalLocation: {
                                            artifactLocation: { uri: null },
                                            region: { startLine: 2, endLine: 2, startColumn: 1, endColumn: 1 }
                                        }
                                    }
                                },
                                {
                                    location: {
                                        physicalLocation: {
                                            artifactLocation: { uri: '' },
                                            region: { startLine: 3, endLine: 3, startColumn: 1, endColumn: 1 }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            ] as any;

            assert.doesNotThrow(() => {
                (runner as any).generateCodeFlowData(filePath, issueLocation, codeFlows);
            });
        });

        it('Should process valid threadFlow locations correctly', () => {
            const filePath: string = '/test/file.js';
            const issueLocation: any = {
                region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
            } as any;

            const codeFlows: any = [
                {
                    threadFlows: [
                        {
                            locations: [
                                {
                                    location: {
                                        physicalLocation: {
                                            artifactLocation: { uri: 'file:///test/file1.js' },
                                            region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
                                        }
                                    }
                                },
                                {
                                    location: {
                                        physicalLocation: {
                                            artifactLocation: { uri: 'file:///test/file2.js' },
                                            region: { startLine: 2, endLine: 2, startColumn: 1, endColumn: 1 }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            ] as any;

            assert.doesNotThrow(() => {
                (runner as any).generateCodeFlowData(filePath, issueLocation, codeFlows);
            });
        });
    });
});
