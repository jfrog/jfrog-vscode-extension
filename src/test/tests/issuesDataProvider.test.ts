import { assert } from 'chai';
import { faker } from '@faker-js/faker';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { IssuesDataProvider, LicensesTitleNode, VulnerabilitiesTitleNode, VulnerabilityNode } from '../../main/treeDataProviders/issuesDataProvider';
import { GeneralInfo } from '../../main/types/generalInfo';
import { IIssueCacheObject } from '../../main/types/issueCacheObject';
import { IIssueKey } from '../../main/types/issueKey';
import { ILicenseCacheObject } from '../../main/types/licenseCacheObject';
import * as issueSeverity from '../../main/types/severity';
import { Severity } from '../../main/types/severity';
import { TestMemento } from './utils/testMemento.test';
import { ScanUtils } from '../../main/utils/scanUtils';

/**
 * Test functionality of @class IssuesDataProvider.
 */
describe('Issues Data Provider Tests', () => {
    let scanCacheManager: ScanCacheManager = new ScanCacheManager();
    let issuesDataProvider: IssuesDataProvider = new IssuesDataProvider(scanCacheManager);
    let dependenciesTreeNode: DependenciesTreeNode;

    before(() => {
        scanCacheManager.activate((<any>{
            storagePath: ScanUtils.createTmpDir(),
            workspaceState: new TestMemento()
        }) as vscode.ExtensionContext);
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
        let issue: IIssueCacheObject = createDummyIssue(Severity.Low);
        storeIssue(dependenciesTreeNode, issue);
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: VulnerabilityNode[] = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 1);
        assertIssue(children[0], issue, 'odin:1.2.3');
    });

    it('Two issues', async () => {
        let issue: IIssueCacheObject = createDummyIssue(Severity.High);
        storeIssue(dependenciesTreeNode, issue);
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: VulnerabilityNode[] = await issuesDataProvider.getChildren();
        assert.lengthOf(children, 2);
        assertIssue(children[0], issue, 'odin:1.2.3');
    });

    it('Second node', async () => {
        // Create a second DependenciesTreNode
        let secondNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('thor', '1.2.4', [], __dirname, 'midgard'));
        dependenciesTreeNode.addChild(secondNode);

        // Add a new issue to the second node
        let issue: IIssueCacheObject = createDummyIssue(Severity.Medium);
        storeIssue(secondNode, issue);

        // Assert the root issues contain the second node issue
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: VulnerabilityNode[] = await issuesDataProvider.getChildren();
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
        storeIssue(dependenciesTreeNode, createDummyIssue(Severity.Pending));
        storeIssue(dependenciesTreeNode, createDummyIssue(Severity.Unknown));
        storeIssue(dependenciesTreeNode, createDummyIssue(Severity.Information));
        storeIssue(dependenciesTreeNode, createDummyIssue(Severity.Low));
        storeIssue(dependenciesTreeNode, createDummyIssue(Severity.Medium));
        storeIssue(dependenciesTreeNode, createDummyIssue(Severity.High));

        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let children: VulnerabilityNode[] = await issuesDataProvider.getChildren();

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

    it('Violated licenses', async () => {
        storeViolatedLicense(dependenciesTreeNode, { name: 'MIT', fullName: 'The MIT License' } as ILicenseCacheObject);
        dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
        let titleNodes: vscode.TreeItem[] = await issuesDataProvider.getChildren();
        assert.lengthOf(titleNodes, 2);
        assert.instanceOf(titleNodes[0], VulnerabilitiesTitleNode);
        assert.instanceOf(titleNodes[1], LicensesTitleNode);
        let licensesTitleNode: LicensesTitleNode = titleNodes[1] as LicensesTitleNode;
        assert.hasAllKeys(licensesTitleNode.violatedLicenses, ['MIT']);
    });

    function assertIssue(actual: VulnerabilityNode, expected: IIssueCacheObject, expectedComponent: string) {
        assert.deepEqual(actual.severity, expected.severity);
        assert.deepEqual(actual.summary, expected.summary);
        assert.deepEqual(actual.component, expectedComponent);
        assert.deepEqual(actual.fixedVersions, expected.fixedVersions);
    }

    function createDummyIssue(severity: Severity): IIssueCacheObject {
        return {
            issueId: 'XRAY-' + faker.datatype.uuid(),
            severity: severity,
            summary: faker.random.words(),
            cves: faker.datatype.array(),
            fixedVersions: faker.datatype.array()
        } as IIssueCacheObject;
    }

    function storeIssue(node: DependenciesTreeNode, issue: IIssueCacheObject) {
        node.issues.add({ issue_id: issue.issueId } as IIssueKey);
        scanCacheManager.storeIssue(issue);
    }

    function storeViolatedLicense(node: DependenciesTreeNode, license: ILicenseCacheObject) {
        node.licenses.add({ licenseName: license.name, violated: true });
        scanCacheManager.storeLicense(license);
    }
});
