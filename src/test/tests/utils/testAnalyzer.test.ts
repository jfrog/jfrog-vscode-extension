import { assert } from 'chai';
import { FileWithSecurityIssues, SecurityIssue } from '../../../main/treeDataProviders/utils/analyzerUtils';
import { CodeFileTreeNode } from '../../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { getTestCodeFileNode } from './treeNodeUtils.test';
import { IssuesRootTreeNode } from '../../../main/treeDataProviders/issuesTree/issuesRootTreeNode';

export function groupFiles(response: { filesWithIssues: FileWithSecurityIssues[] }): FileWithSecurityIssues[] {
    let result: FileWithSecurityIssues[] = [];
    // Collect all the locations from the test data with issues under the same file to be together under the same data
    response.filesWithIssues.forEach((fileWithIssue: FileWithSecurityIssues) => {
        let fileIssues: FileWithSecurityIssues | undefined = result.find(
            (fileIssues: FileWithSecurityIssues) => fileIssues.full_path === fileWithIssue.full_path
        );
        if (!fileIssues) {
            fileIssues = {
                full_path: fileWithIssue.full_path,
                issues: []
            } as FileWithSecurityIssues;
            result.push(fileIssues);
        }
        fileWithIssue.issues.forEach((issue: SecurityIssue) => {
            let secretIssue: SecurityIssue | undefined = fileIssues?.issues.find((secretIssue: SecurityIssue) => secretIssue.ruleId === issue.ruleId);
            if (!secretIssue) {
                secretIssue = {
                    ruleId: issue.ruleId,
                    fullDescription: issue.fullDescription,
                    ruleName: issue.ruleName,
                    severity: issue.severity,
                    locations: []
                } as SecurityIssue;
                fileIssues?.issues.push(secretIssue);
            }
            secretIssue.locations.push(...issue.locations);
        });
    });
    return result;
}

export function testDataAndViewFromScanResponse(
    testRoot: IssuesRootTreeNode,
    expectedFilesWithIssues: FileWithSecurityIssues[],
    getTestIssueNode: (fileNode: CodeFileTreeNode, location: FileRegion) => CodeIssueTreeNode
) {
    it('Check file nodes created for each file with issues', () => {
        expectedFilesWithIssues.forEach((fileIssues: FileWithSecurityIssues) => {
            assert.isDefined(getTestCodeFileNode(testRoot, fileIssues.full_path));
        });
    });

    it('Check number of file nodes populated as root children', () => {
        assert.equal(testRoot.children.length, expectedFilesWithIssues.length, 'files populated: ' + testRoot.children.map(child => child.label));
    });

    describe('Issues populated as nodes', () => {
        it('Check number of issues populated in file', () => {
            expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
                let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
                    assert.equal(fileNode.getIssueById(expectedIssues.ruleId).length, expectedIssues.locations.length);
                });
            });
        });

        it('Check Secret issue in location nodes created in the file node', () => {
            expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
                let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
                    expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                        assert.isDefined(getTestIssueNode(fileNode, expectedLocation));
                    });
                });
            });
        });

        it('Check rule names transferred as label of the issues', () => {
            expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
                let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
                    expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                        assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).label, expectedIssues.ruleName);
                    });
                });
            });
        });

        it('Check issue severity transferred', () => {
            expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
                let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
                    expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                        assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).severity, expectedIssues.severity);
                    });
                });
            });
        });
    });
}
