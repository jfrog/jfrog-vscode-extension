import { assert } from 'chai';
import * as faker from 'faker';
import { IIssue, Severity } from 'jfrog-client-js';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { IIssueKey } from '../../main/types/issueKey';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { IssueNode, IssuesDataProvider } from '../../main/treeDataProviders/issuesDataProvider';
import { GeneralInfo } from '../../main/types/generalInfo';
import { Issue } from '../../main/types/issue';
import * as issueSeverity from '../../main/types/severity';
import { Translators } from '../../main/utils/translators';

/**
 * Test functionality of @class IssuesDataProvider.
 */
describe('Issues Data Provider Tests', () => {
    let scanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        storagePath: tmp.dirSync().name
    } as vscode.ExtensionContext);
    let issuesDataProvider: IssuesDataProvider = new IssuesDataProvider(scanCacheManager);

    let dependenciesTreeNode: DependenciesTreeNode;

    before(() => {
        let generalInfo: GeneralInfo = new GeneralInfo('odin', '1.2.3', [], __dirname, 'asgard');
        dependenciesTreeNode = new DependenciesTreeNode(generalInfo);
    });

    beforeEach(() => {
        issuesDataProvider.selectNode(dependenciesTreeNode);
    });

    it('No issues', async () => {
        let children: DependenciesTreeNode[] = await issuesDataProvider.getChildren();
        assert.isEmpty(children);
    });

    it('One issue', async () => {
        let issue: IIssue = createDummyIssue('Low');
        storeIssue(dependenciesTreeNode, issue);
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: IssueNode[] = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 1);
        assertIssue(children[0], issue, 'odin:1.2.3');
    });

    it('Two issues', async () => {
        let issue: IIssue = createDummyIssue('High');
        storeIssue(dependenciesTreeNode, issue);
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: IssueNode[] = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 2);
        assertIssue(children[0], issue, 'odin:1.2.3');
    });

    it('Second node', async () => {
        // Create a second DependenciesTreNode
        let secondNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('thor', '1.2.4', [], __dirname, 'midgard'));
        dependenciesTreeNode.addChild(secondNode);

        // Add a new issue to the second node
        let issue: IIssue = createDummyIssue('Medium');
        storeIssue(secondNode, issue);

        // Assert the root issues contain the second node issue
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: IssueNode[] = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 3);
        assertIssue(children[1], issue, 'thor:1.2.4');

        // Select the second node and assert that it contains only 1 issue
        issuesDataProvider.selectNode(secondNode);
        children = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 1);
        assertIssue(children[0], issue, 'thor:1.2.4');
    });

    it('Many issues', async () => {
        // Add all kind of issues to the root node
        storeIssue(dependenciesTreeNode, createDummyIssue('Pending'));
        storeIssue(dependenciesTreeNode, createDummyIssue('Unknown'));
        storeIssue(dependenciesTreeNode, createDummyIssue('Information'));
        storeIssue(dependenciesTreeNode, createDummyIssue('Low'));
        storeIssue(dependenciesTreeNode, createDummyIssue('Medium'));
        storeIssue(dependenciesTreeNode, createDummyIssue('High'));

        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: IssueNode[] = await issuesDataProvider.getChildren();

        // Verify all issues exist and sorted
        assert.lengthOf(children, 9);
        assert.deepEqual(children[0].severity, issueSeverity.Severity.High);
        assert.deepEqual(children[1].severity, issueSeverity.Severity.High);
        assert.deepEqual(children[2].severity, issueSeverity.Severity.Medium);
        assert.deepEqual(children[3].severity, issueSeverity.Severity.Medium);
        assert.deepEqual(children[4].severity, issueSeverity.Severity.Low);
        assert.deepEqual(children[5].severity, issueSeverity.Severity.Low);
        assert.deepEqual(children[6].severity, issueSeverity.Severity.Information);
        assert.deepEqual(children[7].severity, issueSeverity.Severity.Unknown);
        assert.deepEqual(children[8].severity, issueSeverity.Severity.Pending);
    });

    function assertIssue(actual: IssueNode, expected: IIssue, expectedComponent: string) {
        let expectedIssue: Issue = Translators.toIssue(expected);
        assert.deepEqual(actual.severity, expectedIssue.severity);
        assert.deepEqual(actual.summary, expectedIssue.summary);
        assert.deepEqual(actual.issueType, expectedIssue.issueType);
        assert.deepEqual(actual.component, expectedComponent);
        assert.deepEqual(actual.fixedVersions, expectedIssue.fixedVersions);
    }

    function createDummyIssue(severity: Severity): IIssue {
        return {
            issue_id: faker.random.word(),
            severity: severity,
            description: faker.random.words(),
            issue_type: faker.random.word()
        } as IIssue;
    }

    function storeIssue(node: DependenciesTreeNode, issue: IIssue) {
        node.issues.add({ issue_id: issue.issue_id } as IIssueKey);
        scanCacheManager.storeIssue(issue);
    }
});
