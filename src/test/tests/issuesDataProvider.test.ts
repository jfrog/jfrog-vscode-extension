import { assert } from 'chai';
import * as faker from 'faker';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { IssueNode, IssuesDataProvider } from '../../main/treeDataProviders/issuesDataProvider';
import { GeneralInfo } from '../../main/types/generalInfo';
import { Issue } from '../../main/types/issue';
import { Severity } from '../../main/types/severity';

/**
 * Test functionality of @class IssuesDataProvider.
 */
describe('Issues Data Provider Tests', () => {
    let issuesDataProvider: IssuesDataProvider = new IssuesDataProvider();
    let dependenciesTreeNode: DependenciesTreeNode;

    before(() => {
        let generalInfo: GeneralInfo = new GeneralInfo('odin', '1.2.3', __dirname, 'asgard');
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
        let issue: Issue = createDummyIssue(Severity.Low);
        dependenciesTreeNode.issues.add(issue);
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: IssueNode[] = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 1);
        assertIssue(children[0], issue, 'odin:1.2.3');
    });

    it('Two issues', async () => {
        let issue: Issue = createDummyIssue(Severity.High);
        dependenciesTreeNode.issues.add(issue);
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: IssueNode[] = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 2);
        assertIssue(children[0], issue, 'odin:1.2.3');
    });

    it('Second node', async () => {
        // Create a second DependenciesTreNode
        let secondNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('thor', '1.2.4', __dirname, 'midgard'));
        dependenciesTreeNode.addChild(secondNode);

        // Add a new issue to the second node
        let issue: Issue = createDummyIssue(Severity.Medium);
        secondNode.issues.add(issue);

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
        for (let severity of [Severity.Pending, Severity.Unknown, Severity.Information, Severity.Low, Severity.Medium, Severity.High]) {
            dependenciesTreeNode.issues.add(createDummyIssue(severity));
        }
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: IssueNode[] = await issuesDataProvider.getChildren();

        // Verify all issues exist and sorted
        assert.lengthOf(children, 9);
        assert.deepEqual(children[0].severity, Severity.High);
        assert.deepEqual(children[1].severity, Severity.High);
        assert.deepEqual(children[2].severity, Severity.Medium);
        assert.deepEqual(children[3].severity, Severity.Medium);
        assert.deepEqual(children[4].severity, Severity.Low);
        assert.deepEqual(children[5].severity, Severity.Low);
        assert.deepEqual(children[6].severity, Severity.Information);
        assert.deepEqual(children[7].severity, Severity.Unknown);
        assert.deepEqual(children[8].severity, Severity.Pending);
    });

    function assertIssue(actual: IssueNode, expected: Issue, expectedComponent: string) {
        assert.deepEqual(actual.severity, expected.severity);
        assert.deepEqual(actual.summary, expected.summary);
        assert.deepEqual(actual.issueType, expected.issueType);
        assert.deepEqual(actual.component, expectedComponent);
        assert.deepEqual(actual.fixedVersions, expected.fixedVersions);
    }

    function createDummyIssue(severity: Severity) {
        return new Issue(faker.random.words(), severity, faker.random.words(), faker.random.word(), [faker.random.word()]);
    }
});
