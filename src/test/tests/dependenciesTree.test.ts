import { assert } from 'chai';
import { faker } from '@faker-js/faker';
import { before } from 'mocha';
import * as Collections from 'typescript-collections';
import { IIssueKey } from '../../main/types/issueKey';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { Severity } from '../../main/types/severity';
import { PackageType } from '../../main/types/projectType';
/**
 * Test functionality of @class DependenciesTreeNode.
 */
describe('Dependencies Tree Tests', () => {
    let issueOne: IIssueKey = createDummyIssue();
    let issueTwo: IIssueKey = createDummyIssue();
    let lowIssueOne: IIssueKey = createDummyIssue();
    let lowIssueTwo: IIssueKey = createDummyIssue();
    let mediumIssue: IIssueKey = createDummyIssue();

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
        let rootIssues: Collections.Set<IIssueKey> = processTree();
        assert.isTrue(rootIssues.isEmpty());
        assert.deepEqual(root.topSeverity, Severity.Normal);
    });

    it('One node', () => {
        // Populate 'one' with one empty issue.
        one.issues.add(issueOne);

        // Assert the tree has 1 issue.
        let rootIssues: Collections.Set<IIssueKey> = processTree();
        assert.deepEqual(rootIssues.size(), 1);
        assert.containsAllKeys(rootIssues, one.issues);
    });

    it('Two nodes', () => {
        // Populate node two with one empty issue.
        two.issues.add(issueTwo);

        // Assert the tree has 2 issues
        let rootIssues: Collections.Set<IIssueKey> = processTree();
        assert.deepEqual(rootIssues.size(), 2);
        assert.containsAllKeys(rootIssues, one.issues);
        assert.containsAllKeys(rootIssues, two.issues);
    });

    it('Four nodes', () => {
        // Populate node three with one Low issue
        three.issues.add(lowIssueOne);
        three.topSeverity = Severity.Low;
        processTree();

        // Assert the tree has 3 issues
        let rootIssues: Collections.Set<IIssueKey> = processTree();
        assert.containsAllKeys(rootIssues, one.issues);
        assert.containsAllKeys(rootIssues, two.issues);
        assert.containsAllKeys(rootIssues, three.issues);

        // Populate node four with Low and Medium issues
        four.issues.add(mediumIssue);
        four.issues.add(lowIssueTwo);
        four.topSeverity = Severity.Medium;

        // Assert the tree has 5 issues
        rootIssues = processTree();
        assert.deepEqual(rootIssues.size(), 5);
        assert.deepEqual(root.topSeverity, Severity.Medium);
        assert.containsAllKeys(rootIssues, one.issues);
        assert.containsAllKeys(rootIssues, two.issues);
        assert.containsAllKeys(rootIssues, three.issues);
        assert.containsAllKeys(rootIssues, four.issues);
    });

    it('Five nodes', () => {
        // Populate node five with 6 issues
        five.issues.add(createDummyIssue());
        five.issues.add(createDummyIssue());
        five.issues.add(createDummyIssue());
        five.issues.add(createDummyIssue());
        five.issues.add(createDummyIssue());
        five.issues.add(createDummyIssue());
        five.topSeverity = Severity.High;

        // Assert that all issues are in the tree
        let rootIssues: Collections.Set<IIssueKey> = processTree();
        assert.deepEqual(rootIssues.size(), 11);
        assert.deepEqual(root.topSeverity, Severity.High);
        assert.containsAllKeys(rootIssues, one.issues);
        assert.containsAllKeys(rootIssues, two.issues);
        assert.containsAllKeys(rootIssues, three.issues);
        assert.containsAllKeys(rootIssues, four.issues);
        assert.containsAllKeys(rootIssues, five.issues);
    });

    function processTree(): Collections.Set<IIssueKey> {
        return root.processTreeIssues();
    }

    function createNode(label: string): DependenciesTreeNode {
        return new DependenciesTreeNode(new GeneralInfo(label, '1.0.0', [], '', PackageType.Unknown));
    }

    function createDummyIssue(): IIssueKey {
        return { issue_id: faker.datatype.uuid() } as IIssueKey;
    }
});
