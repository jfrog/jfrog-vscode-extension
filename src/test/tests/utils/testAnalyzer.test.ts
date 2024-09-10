import { assert } from 'chai';
import { FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { SastFileIssues, SastIssue } from '../../../main/scanLogic/scanRunners/sastScan';
import { CodeFileTreeNode } from '../../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { IacTreeNode } from '../../../main/treeDataProviders/issuesTree/codeFileTree/iacTreeNode';
import { SecretTreeNode } from '../../../main/treeDataProviders/issuesTree/codeFileTree/secretsTreeNode';
import { IssuesRootTreeNode } from '../../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { FileWithSecurityIssues, SecurityIssue } from '../../../main/treeDataProviders/utils/analyzerUtils';
import { getTestCodeFileNode } from './treeNodeUtils.test';
import { SastTreeNode } from '../../../main/treeDataProviders/issuesTree/codeFileTree/sastTreeNode';

export function groupFiles(response: { filesWithIssues: FileWithSecurityIssues[] | SastFileIssues[] }): FileWithSecurityIssues[] {
    let result: FileWithSecurityIssues[] = [];
    // Collect all the locations from the test data with issues under the same file to be together under the same data
    response.filesWithIssues.forEach((fileWithIssue: FileWithSecurityIssues | SastFileIssues) => {
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
        fileWithIssue.issues.forEach((issue: SecurityIssue | SastIssue) => {
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
            secretIssue.locations.push(...toFileRegions(issue.locations));
        });
    });
    return result;
}

export function toFileRegions(regions: any[]): FileRegion[] {
    let results: FileRegion[] = [];
    if (!regions || regions.length === 0) {
        return results;
    }
    if ('region' in regions[0]) {
        // 'regions' is an array of SastIssue
        for (let region of regions) {
            results.push(region.region);
        }
        return results;
    }
    // 'regions' is already an array of FileRegion
    return regions;
}

export function findLocationNode(location: FileRegion, fileNode: CodeFileTreeNode): CodeIssueTreeNode | undefined {
    return fileNode.issues.find(
        issue =>
            // Location in vscode start from 0, in scanners location starts from 1
            issue.regionWithIssue.start.line === location.startLine - 1 &&
            issue.regionWithIssue.end.line === location.endLine - 1 &&
            issue.regionWithIssue.start.character === location.startColumn - 1 &&
            issue.regionWithIssue.end.character === location.endColumn - 1
    );
}

export function assertTokenValidationResult(
    testRoot: IssuesRootTreeNode,
    expectedFilesWithIssues: FileWithSecurityIssues[],
    getTestIssueNode: (fileNode: CodeFileTreeNode, location: FileRegion) => SecretTreeNode
) {
    expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
        expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).metadata, expectedLocation.metadata);
                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).tokenValidation, expectedLocation.tokenValidation);
            });
        });
    });
}

export function assertFileNodesCreated(testRoot: IssuesRootTreeNode, expectedFilesWithIssues: FileWithSecurityIssues[]) {
    expectedFilesWithIssues.forEach((fileIssues: FileWithSecurityIssues) => {
        assert.isDefined(getTestCodeFileNode(testRoot, fileIssues.full_path));
    });
}

export function assertSameNumberOfFileNodes(testRoot: IssuesRootTreeNode, expectedFilesWithIssues: FileWithSecurityIssues[]) {
    assert.equal(testRoot.children.length, expectedFilesWithIssues.length, 'files populated: ' + testRoot.children.map(child => child.label));
}

export function assertSameNumberOfIssueNodes(testRoot: IssuesRootTreeNode, expectedFilesWithIssues: FileWithSecurityIssues[]) {
    expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
        expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            assert.equal(fileNode.getIssueById(expectedIssues.ruleId).length, expectedIssues.locations.length);
        });
    });
}

export function assertIssueNodesCreated(
    testRoot: IssuesRootTreeNode,
    expectedFilesWithIssues: FileWithSecurityIssues[],
    getTestIssueNode: (fileNode: CodeFileTreeNode, location: FileRegion) => CodeIssueTreeNode
) {
    expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
        expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.isDefined(getTestIssueNode(fileNode, expectedLocation));
            });
        });
    });
}

export function assertNodeLabelRuleName(
    testRoot: IssuesRootTreeNode,
    expectedFilesWithIssues: FileWithSecurityIssues[],
    getTestIssueNode: (fileNode: CodeFileTreeNode, location: FileRegion) => CodeIssueTreeNode
) {
    expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
        expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).label, expectedIssues.ruleName);
            });
        });
    });
}

export function assertNodesSeverity(
    testRoot: IssuesRootTreeNode,
    expectedFilesWithIssues: FileWithSecurityIssues[],
    getTestIssueNode: (fileNode: CodeFileTreeNode, location: FileRegion) => CodeIssueTreeNode
) {
    expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
        expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).severity, expectedIssues.severity);
            });
        });
    });
}

export function assertIssuesFullDescription(
    testRoot: IssuesRootTreeNode,
    expectedFilesWithIssues: FileWithSecurityIssues[],
    getTestIssueNode: (fileNode: CodeFileTreeNode, location: FileRegion) => SecretTreeNode | IacTreeNode | SastTreeNode
) {
    expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
        expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).fullDescription, expectedIssues.fullDescription);
            });
        });
    });
}

export function assertIssuesSnippet(
    testRoot: IssuesRootTreeNode,
    expectedFilesWithIssues: FileWithSecurityIssues[],
    getTestIssueNode: (fileNode: CodeFileTreeNode, location: FileRegion) => SecretTreeNode | IacTreeNode | SastTreeNode
) {
    expectedFilesWithIssues.forEach((expectedFileIssues: FileWithSecurityIssues) => {
        let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
        expectedFileIssues.issues.forEach((expectedIssues: SecurityIssue) => {
            expectedIssues.locations.forEach((expectedLocation: FileRegion) => {
                assert.deepEqual(getTestIssueNode(fileNode, expectedLocation).snippet, expectedLocation.snippet?.text);
            });
        });
    });
}
