import { assert } from 'chai';
import { faker } from '@faker-js/faker';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { ILicenseCacheObject } from '../../main/types/licenseCacheObject';
import { ILicenseKey } from '../../main/types/licenseKey';
import { createScanCacheManager } from './utils/utils.test';
import { LicensesNode } from '../../main/treeDataProviders/generalDetailsDataProvider';
import { DependencyDetailsProvider } from '../../main/treeDataProviders/dependencyDetailsProvider';
import { TreeDataHolder } from '../../main/treeDataProviders/utils/treeDataHolder';
import { PackageType } from '../../main/types/projectType';
// import { SourceCodeTreeDataProvider } from '../../main/treeDataProviders/sourceCodeTree/sourceCodeTreeDataProvider';
// import { TreesManager } from '../../main/treeDataProviders/treesManager';
// import { LogManager } from '../../main/log/logManager';
// import { ScanLogicManager } from '../../main/scanLogic/scanLogicManager';
// import { ConnectionManager } from '../../main/connect/connectionManager';
// import { ScanManager } from '../../main/scanLogic/scanManager';
// import { CacheManager } from '../../main/cache/cacheManager';

/**
 * Test functionality of @class DependencyDataProvider.
 */
describe('Dependency Details Tests', () => {
    let scanCacheManager: ScanCacheManager = createScanCacheManager();
    // let logManager: LogManager = new LogManager().activate();
    // let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();
    // let treesManager: TreesManager = new TreesManager(
    //     [],
    //     new ConnectionManager(logManager),
    //     dummyScanCacheManager,
    //     {} as ScanManager,
    //     {} as CacheManager,
    //     logManager
    // );
    // let sourceCodeTreeDataProvider: SourceCodeTreeDataProvider = new SourceCodeTreeDataProvider([], treesManager);
    let Components: DependencyDetailsProvider = new DependencyDetailsProvider(scanCacheManager); //, sourceCodeTreeDataProvider);
    let dependenciesTreeNode: DependenciesTreeNode;
    before(() => {
        let generalInfo: GeneralInfo = new GeneralInfo('artifactId', '1.2.3', [], __dirname, PackageType.Unknown);
        dependenciesTreeNode = new DependenciesTreeNode(generalInfo);
        Components.selectNode(dependenciesTreeNode);
    });

    it('No licenses', async () => {
        let generalDetailNode: any = await Components.generalDetailsProvider.getChildren();

        let artifactNode: TreeDataHolder = generalDetailNode[0];
        assert.deepEqual(artifactNode.key, 'Artifact');
        assert.deepEqual(artifactNode.value, 'artifactId');

        let versionNode: TreeDataHolder = generalDetailNode[1];
        assert.deepEqual(versionNode.key, 'Version');
        assert.deepEqual(versionNode.value, '1.2.3');

        let pkgTypeNode: TreeDataHolder = generalDetailNode[2];
        assert.deepEqual(pkgTypeNode.key, 'Type');
        assert.deepEqual(pkgTypeNode.value, 'Unknown');

        let licenses: any[] = await getAndAssertLicenses();
        assert.isEmpty(licenses);
    });

    it('One license', async () => {
        let license: ILicenseCacheObject = createDummyLicense();
        scanCacheManager.storeLicense(license);
        dependenciesTreeNode.licenses.add({ licenseName: license.name, violated: license.violated } as ILicenseKey);
        await assertLicense(license, 0);
    });

    it('Two licenses', async () => {
        let license: ILicenseCacheObject = createDummyLicense();
        scanCacheManager.storeLicense(license);
        dependenciesTreeNode.licenses.add({ licenseName: license.name, violated: license.violated } as ILicenseKey);
        await assertLicense(license, 1);
    });

    function createDummyLicense(): ILicenseCacheObject {
        return {
            name: faker.name.firstName(),
            fullName: faker.name.lastName(),
            violated: faker.datatype.boolean(),
            moreInfoUrl: faker.internet.url()
        } as ILicenseCacheObject;
    }

    async function getAndAssertLicenses(): Promise<any[]> {
        let treeItem: any[] = await Components.generalDetailsProvider.getChildren();
        let licensesNode: LicensesNode = treeItem[5];
        if (licensesNode === undefined) {
            return [];
        }
        assert.deepEqual(licensesNode.label, 'Licenses');
        assert.deepEqual(licensesNode.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
        return licensesNode.getChildren();
    }

    async function assertLicense(license: ILicenseCacheObject, index: number) {
        let licenses: any[] = await getAndAssertLicenses();
        assert.lengthOf(licenses, index + 1);
        assert.deepEqual(licenses[index]._key, license.fullName + ' (' + license.name + ')');
        assert.deepEqual(licenses[index]._value, license.moreInfoUrl);
        assert.deepEqual(licenses[index]._link, license.moreInfoUrl);
    }
});
