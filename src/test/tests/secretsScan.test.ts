import * as path from 'path';

import { assert } from 'chai';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { createRootTestNode } from './utils/treeNodeUtils.test';
import { ScanResults } from '../../main/types/workspaceIssuesDetails';
import { AnalyzerUtils, FileWithSecurityIssues } from '../../main/treeDataProviders/utils/analyzerUtils';
import { getAnalyzerScanResponse, getEmptyAnalyzerScanResponse } from './utils/utils.test';
import { FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import { CodeIssueTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { SecretsRunner, SecretsScanResponse } from '../../main/scanLogic/scanRunners/secretsScan';
import { SecretTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/secretsTreeNode';
import {
    assertFileNodesCreated,
    assertIssueNodesCreated,
    assertIssuesFullDescription,
    assertNodeLabelRuleName,
    assertNodesSeverity,
    assertIssuesSnippet,
    assertSameNumberOfFileNodes,
    assertSameNumberOfIssueNodes,
    findLocationNode,
    groupFiles
} from './utils/testAnalyzer.test';

describe('Secrets Scan Tests', () => {
    const scanSecrets: string = path.join(__dirname, '..', 'resources', 'secretsScan');
    let logManager: LogManager = new LogManager().activate();

    describe('Secrets scan fails', () => {
        let response: SecretsScanResponse;

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

    describe('Secrets scan no issues found', () => {
        let response: SecretsScanResponse;

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

    describe('Secrets scan success', () => {
        const testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
        let expectedScanResult: ScanResults;
        let expectedFilesWithIssues: FileWithSecurityIssues[] = [];
        let populatedIssues: number;

        before(() => {
            // Read test data and populate scanResult
            let response: SecretsScanResponse = getDummyRunner().convertResponse(
                getAnalyzerScanResponse(path.join(scanSecrets, 'analyzerResponse.json'))
            );
            expectedFilesWithIssues = groupFiles(response);
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
            function getTestIssueNode(fileNode: CodeFileTreeNode, location: FileRegion): SecretTreeNode {
                let issueLocation: CodeIssueTreeNode | undefined = findLocationNode(location, fileNode);
                if (!(issueLocation instanceof SecretTreeNode)) {
                    assert.fail('expected node to be SecretTreeNode issue for location ' + location + ' in node: ' + issueLocation);
                }
                return <SecretTreeNode>issueLocation;
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

    function getDummyRunner(): SecretsRunner {
        return new SecretsRunner({} as ConnectionManager, logManager);
    }
});
