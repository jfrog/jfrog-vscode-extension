import { assert } from 'chai';
import * as faker from 'faker';
import * as vscode from 'vscode';
import { ComponentDetailsDataProvider, LicensesNode } from '../../main/treeDataProviders/componentDetailsDataProvider';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from '../../main/treeDataProviders/utils/treeDataHolder';
import { GeneralInfo } from '../../main/types/generalInfo';
import { License } from '../../main/types/license';

/**
 * Test functionality of @class ComponentDetailsDataProvider.
 */
describe('Component Details Tests', () => {
    let componentDetails: ComponentDetailsDataProvider = new ComponentDetailsDataProvider();
    let dependenciesTreeNode: DependenciesTreeNode;
    before(() => {
        let generalInfo: GeneralInfo = new GeneralInfo('artifactId', '1.2.3', __dirname, 'testPkg');
        dependenciesTreeNode = new DependenciesTreeNode(generalInfo);
        componentDetails.selectNode(dependenciesTreeNode);
    });

    it('No licenses', async () => {
        let treeItem: any[] = await componentDetails.getChildren();

        let artifactNode: TreeDataHolder = treeItem[0];
        assert.deepEqual(artifactNode.key, 'Artifact');
        assert.deepEqual(artifactNode.value, 'artifactId');

        let versionNode: TreeDataHolder = treeItem[1];
        assert.deepEqual(versionNode.key, 'Version');
        assert.deepEqual(versionNode.value, '1.2.3');

        let pkgTypeNode: TreeDataHolder = treeItem[2];
        assert.deepEqual(pkgTypeNode.key, 'Type');
        assert.deepEqual(pkgTypeNode.value, 'testPkg');

        let licenses: any[] = await getAndAssertLicenses();
        assert.isEmpty(licenses);
    });

    it('One license', async () => {
        let license: License = createDummyLicense();
        dependenciesTreeNode.licenses.add(license);
        await assertLicense(license, 0);
    });

    it('Two licenses', async () => {
        let license: License = createDummyLicense();
        dependenciesTreeNode.licenses.add(license);
        await assertLicense(license, 1);
    });

    function createDummyLicense(): License {
        return new License([faker.internet.url()], [], faker.name.firstName(), faker.name.firstName() + ' ' + faker.name.lastName());
    }

    async function getAndAssertLicenses(): Promise<any[]> {
        let treeItem: any[] = await componentDetails.getChildren();
        let licensesNode: LicensesNode = treeItem[5];
        assert.deepEqual(licensesNode.label, 'Licenses');
        assert.deepEqual(licensesNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        return licensesNode.getChildren();
    }

    async function assertLicense(license: License, index: number) {
        let licenses: any[] = await getAndAssertLicenses();
        assert.lengthOf(licenses, index + 1);
        assert.deepEqual(licenses[index].key, license.fullName + ' (' + license.name + ')');
        assert.deepEqual(licenses[index].value, license.moreInfoUrl[0]);
        assert.deepEqual(licenses[index].link, license.moreInfoUrl[0]);
    }
});
