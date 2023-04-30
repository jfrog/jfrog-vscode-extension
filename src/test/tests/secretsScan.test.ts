import * as path from 'path';

import { assert } from 'chai';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanUtils } from '../../main/utils/scanUtils';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { createRootTestNode, getTestCodeFileNode } from './utils/treeNodeUtils.test';
import { ScanResults } from '../../main/types/workspaceIssuesDetails';
import { AnalyzerUtils } from '../../main/treeDataProviders/utils/analyzerUtils';
import { getAnalyzerScanResponse } from './utils/utils.test';
import { FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import { CodeIssueTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { SecretsFileIssues, SecretsIssue, SecretsRunner, SecretsScanResponse } from '../../main/scanLogic/scanRunners/secretsScan';
import { SecretTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/secretsTreeNode';

describe('Secrets Scan Tests', () => {
    const scanSecrets: string = path.join(__dirname, '..', 'resources', 'secretsScan');
    let logManager: LogManager = new LogManager().activate();

    describe('Secrets scan fails', () => {
        let response: SecretsScanResponse;

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

    describe('Populate Secrets information tests', () => {
        const testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
        let expectedScanResult: ScanResults;
        let populatedIssues: number;

        before(() => {
            // Read test data and populate scanResult
            let response: SecretsScanResponse = getDummyRunner().generateScanResponse(
                getAnalyzerScanResponse(path.join(scanSecrets, 'analyzerResponse.json'))
            );
            expectedScanResult = {
                secretsScanTimestamp: 22,
                secretsScan: response
            } as ScanResults;
            // Populate scan result information to the test dummy node
            populatedIssues = AnalyzerUtils.populateSecretsIssues(testRoot, expectedScanResult);
        });

        it('Check issue count returned from method', () => {
            assert.equal(populatedIssues, 3);
        });

        it('Check timestamp transferred from data to node', () => {
            assert.equal(expectedScanResult.secretsScanTimestamp, testRoot.secretsScanTimeStamp);
        });

        describe('Data populated as CodeFileTreeNode nodes', () => {
            let expectedFilesWithIssues: SecretsFileIssues[] = [];

            before(() => {
                // Collect all the locations from the test data with issues under the same file to be together under the same data
                expectedScanResult.secretsScan.filesWithIssues.forEach((fileWithIssue: SecretsFileIssues) => {
                    let fileIssues: SecretsFileIssues | undefined = expectedFilesWithIssues.find(
                        (fileIssues: SecretsFileIssues) => fileIssues.full_path === fileWithIssue.full_path
                    );
                    if (!fileIssues) {
                        fileIssues = {
                            full_path: fileWithIssue.full_path,
                            issues: []
                        } as SecretsFileIssues;
                        expectedFilesWithIssues.push(fileIssues);
                    }
                    fileWithIssue.issues.forEach((issue: SecretsIssue) => {
                        let secretIssue: SecretsIssue | undefined = fileIssues?.issues.find(
                            (secretIssue: SecretsIssue) => secretIssue.ruleId === issue.ruleId
                        );
                        if (!secretIssue) {
                            secretIssue = {
                                ruleId: issue.ruleId,
                                fullDescription: issue.fullDescription,
                                ruleName: issue.ruleName,
                                severity: issue.severity,
                                locations: []
                            } as SecretsIssue;
                            fileIssues?.issues.push(secretIssue);
                        }
                        secretIssue.locations.push(...issue.locations);
                    });
                });
            });

            it('Check file nodes created for each file with issues', () => {
                expectedFilesWithIssues.forEach((fileIssues: SecretsFileIssues) => {
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

            describe('Issues populated as SecretsTreeNode nodes', () => {
                function getTestIssueNode(fileNode: CodeFileTreeNode, location: FileRegion): SecretTreeNode {
                    let issueLocation: CodeIssueTreeNode | undefined = fileNode.issues.find(
                        issue =>
                            // Location in vscode start from 0, in scanners location starts from 1
                            issue.regionWithIssue.start.line === location.startLine - 1 &&
                            issue.regionWithIssue.end.line === location.endLine - 1 &&
                            issue.regionWithIssue.start.character === location.startColumn - 1 &&
                            issue.regionWithIssue.end.character === location.endColumn - 1
                    );
                    if (!(issueLocation instanceof SecretTreeNode)) {
                        assert.fail('expected node to be SecretTreeNode issue for location ' + location + ' in node: ' + issueLocation);
                    }
                    return <SecretTreeNode>issueLocation;
                }

                it('Check number of issues populated in file', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: SecretsFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedSecretIssues: SecretsIssue) => {
                            assert.equal(fileNode.getIssueById(expectedSecretIssues.ruleId).length, expectedSecretIssues.locations.length);
                        });
                    });
                });

                it('Check Secret issue in location nodes created in the file node', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: SecretsFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedSecretIssues: SecretsIssue) => {
                            expectedSecretIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.isDefined(getTestIssueNode(fileNode, expectedLocation));
                            });
                        });
                    });
                });

                it('Check rule names transferred as label of the issues', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: SecretsFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedSecretIssues: SecretsIssue) => {
                            expectedSecretIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).label, expectedSecretIssues.ruleName);
                            });
                        });
                    });
                });

                it('Check rule full description transferred', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: SecretsFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: SecretsIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).fullDescription, expectedIacIssues.fullDescription);
                            });
                        });
                    });
                });

                it('Check snippet text at location with issue transferred', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: SecretsFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: SecretsIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).snippet, expectedLocation.snippet?.text);
                            });
                        });
                    });
                });

                it('Check issue severity transferred', () => {
                    expectedFilesWithIssues.forEach((expectedFileIssues: SecretsFileIssues) => {
                        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                        expectedFileIssues.issues.forEach((expectedIacIssues: SecretsIssue) => {
                            expectedIacIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).severity, expectedIacIssues.severity);
                            });
                        });
                    });
                });
            });
        });
    });

    function getDummyRunner(): SecretsRunner {
        return new SecretsRunner({} as ConnectionManager, ScanUtils.ANALYZER_TIMEOUT_MILLISECS, logManager);
    }
});
