import { assert } from 'chai';
import * as faker from 'faker';
import { before } from 'mocha';
import * as Collections from 'typescript-collections';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { Issue } from '../../main/types/issue';
import { Severity } from '../../main/types/severity';

/**
 * Test functionality of @class DependenciesTreeNode.
 */
describe('Dependencies Tree Tests', () => {
    let issueSerialNumber: number = 0;
    let root: DependenciesTreeNode = createNode('root');
    let one: DependenciesTreeNode = createNode('one');
    let two: DependenciesTreeNode = createNode('two');
    let three: DependenciesTreeNode = createNode('three');
    let four: DependenciesTreeNode = createNode('four');
    let five: DependenciesTreeNode = createNode('five');

    before(() => {
        root.addChild(one); // 0 -> 1
        root.addChild(two); // 0 -> 2
        two.addChild(three); // 2 -> 3
        two.addChild(four); // 2 -> 4
        four.addChild(five); // 4 -> 5
    });

    it('No issues', () => {
        let rootIssues: Collections.Set<Issue> = processTree();
        assert.isTrue(rootIssues.isEmpty());
        assert.deepEqual(root.topIssue.severity, Severity.Normal);
    });

    it('One node', () => {
        // Populate 'one' with one empty issue.
        one.issues.add(createDummyIssue(Severity.Normal));

        // Assert the tree has 1 issue.
        let rootIssues: Collections.Set<Issue> = processTree();
        assert.deepEqual(rootIssues.size(), 1);
        assert.deepEqual(rootIssues.toArray()[0].severity, Severity.Normal);
    });

    it('Two nodes', () => {
        // Populate node two with one empty issue.
        two.issues.add(createDummyIssue(Severity.Normal));

        // Assert the tree has 2 issues
        let rootIssues: Collections.Set<Issue> = processTree();
        assert.deepEqual(rootIssues.size(), 2);
        assert.deepEqual(rootIssues.toArray()[0].severity, Severity.Normal);
        assert.deepEqual(rootIssues.toArray()[1].severity, Severity.Normal);
    });

    it('Four nodes', () => {
        // Populate node three with one Low issue
        three.issues.add(createDummyIssue(Severity.Low));
        processTree();

        // Assert the tree has 3 issues
        assert.deepEqual(three.topIssue.severity, Severity.Low);
        assert.deepEqual(three.topIssue.component, 'three:1.0.0');

        // Populate node four with Low and Medium issues
        let mediumIssue: Issue = createDummyIssue(Severity.Medium);
        four.issues.add(mediumIssue);
        four.issues.add(createDummyIssue(Severity.Low));

        // Assert the tree has 5 issues
        let rootIssues: Collections.Set<Issue> = processTree();
        assert.deepEqual(rootIssues.size(), 5);
        assert.deepEqual(root.topIssue, mediumIssue);
    });

    it('Five nodes', () => {
        // Populate node five with 6 issues
        five.issues.add(createDummyIssue(Severity.Normal));
        five.issues.add(createDummyIssue(Severity.Low));
        five.issues.add(createDummyIssue(Severity.Low));
        five.issues.add(createDummyIssue(Severity.Unknown));
        five.issues.add(createDummyIssue(Severity.Low));
        five.issues.add(createDummyIssue(Severity.High));

        // Assert that all issues are in the tree
        let rootIssues: Collections.Set<Issue> = processTree();
        assert.deepEqual(rootIssues.size(), 11);
        assert.deepEqual(root.topIssue.severity, Severity.High);
        assert.deepEqual(root.topIssue.component, 'five:1.0.0');
        assert.deepEqual(one.topIssue.component, '');
        assert.deepEqual(two.topIssue.component, 'five:1.0.0');
        assert.deepEqual(three.topIssue.component, 'three:1.0.0');
        assert.deepEqual(four.topIssue.component, 'five:1.0.0');
        assert.deepEqual(five.topIssue.component, 'five:1.0.0');
    });

    function processTree(): Collections.Set<Issue> {
        return root.processTreeIssues();
    }
    function createNode(label: string): DependenciesTreeNode {
        return new DependenciesTreeNode(new GeneralInfo(label, '1.0.0', '', ''));
    }

    function createDummyIssue(severity: Severity) {
        return new Issue(faker.random.words(1) + issueSerialNumber++, severity, faker.random.words(), faker.random.word(), [faker.random.word()]);
    }
});
