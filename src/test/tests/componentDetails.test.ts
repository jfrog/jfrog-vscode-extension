import { assert } from 'chai';
import * as faker from 'faker';
import { ILicense } from 'jfrog-client-js';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { ComponentDetailsDataProvider, LicensesNode } from '../../main/treeDataProviders/componentDetailsDataProvider';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreeDataHolder } from '../../main/treeDataProviders/utils/treeDataHolder';
import { GeneralInfo } from '../../main/types/generalInfo';
import { License } from '../../main/types/license';

/**
 * Test functionality of @class ComponentDetailsDataProvider.
 */
describe('Component Details Tests', () => {
    let scanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        storagePath: tmp.dirSync().name
    } as vscode.ExtensionContext);
    let componentDetails: ComponentDetailsDataProvider = new ComponentDetailsDataProvider(scanCacheManager);
    let dependenciesTreeNode: DependenciesTreeNode;
    before(() => {
        let generalInfo: GeneralInfo = new GeneralInfo('artifactId', '1.2.3', [], __dirname, 'testPkg');
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
        scanCacheManager.storeLicense({ name: license.name, full_name: license.fullName, more_info_url: license.moreInfoUrl } as ILicense);
        dependenciesTreeNode.licenses.add(license.name);
        await assertLicense(license, 0);
    });

    it('Two licenses', async () => {
        let license: License = createDummyLicense();
        scanCacheManager.storeLicense({ name: license.name, full_name: license.fullName, more_info_url: license.moreInfoUrl } as ILicense);
        dependenciesTreeNode.licenses.add(license.name);
        await assertLicense(license, 1);
    });

    function createDummyLicense(): License {
        return new License([faker.internet.url()], faker.name.firstName(), faker.name.firstName() + ' ' + faker.name.lastName());
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
        assert.deepEqual(licenses[index]._key, license.fullName + ' (' + license.name + ')');
        assert.deepEqual(licenses[index]._value, license.moreInfoUrl[0]);
        assert.deepEqual(licenses[index]._link, license.moreInfoUrl[0]);
    }
});
