import { assert } from 'chai';
import { IArtifact, IGeneral, IIssue, ILicense } from 'jfrog-client-js';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { IIssueCacheObject } from '../../main/types/issueCacheObject';
import { IIssueKey } from '../../main/types/issueKey';
import { ILicenseCacheObject } from '../../main/types/licenseCacheObject';
import { ILicenseKey } from '../../main/types/licenseKey';
import { INodeInfo } from '../../main/types/nodeInfo';
import { createScanCacheManager } from './utils/utils.test';

/**
 * Test functionality of @class ScanCacheManager`.
 */
describe('Scan Cache Manager Tests', () => {
    it('Store issue', () => {
        let scanCacheManager: ScanCacheManager = createScanCacheManager();
        scanCacheManager.storeIssue({ issueId: 'XRAY-1234' } as IIssueCacheObject);
        assert.isDefined(scanCacheManager.getIssue('XRAY-1234'));
    });

    it('Store license', () => {
        let scanCacheManager: ScanCacheManager = createScanCacheManager();
        scanCacheManager.storeLicense({ name: 'MIT' } as ILicenseCacheObject);
        assert.isDefined(scanCacheManager.getLicense('MIT'));

        scanCacheManager.storeLicense({ name: 'MIT/X11' } as ILicenseCacheObject);
        assert.isDefined(scanCacheManager.getLicense('MIT/X11'));
    });

    it('Store artifacts', async () => {
        let scanCacheManager: ScanCacheManager = createScanCacheManager();
        let artifact: IArtifact = {
            general: { component_id: 'a:b:c', pkg_type: 'maven' } as IGeneral,
            issues: [{ issue_id: 'XRAY-1' } as IIssue, { issue_id: 'XRAY-2' } as IIssue],
            licenses: [{ name: 'MIT' } as ILicense, { name: 'MIT/X11' } as ILicense]
        } as IArtifact;
        await scanCacheManager.storeArtifacts([artifact]);

        let nodeInfo: INodeInfo | undefined = scanCacheManager.getNodeInfo('a:b:c');

        assert.isDefined(nodeInfo);

        let actualIssues: IIssueKey[] | undefined = nodeInfo?.issues;
        assert.isDefined(actualIssues);
        assert.deepEqual(actualIssues, [
            { issue_id: 'XRAY-1', component: 'a:b:c' } as IIssueKey,
            { issue_id: 'XRAY-2', component: 'a:b:c' } as IIssueKey
        ]);

        let actualLicenses: ILicenseKey[] | undefined = nodeInfo?.licenses;
        assert.isDefined(actualLicenses);
        assert.deepEqual(actualLicenses, [
            { licenseName: 'MIT', violated: false } as ILicenseKey,
            { licenseName: 'MIT/X11', violated: false } as ILicenseKey
        ]);
    });

    it('Store components', async () => {
        let scanCacheManager: ScanCacheManager = createScanCacheManager();
        let scannedComponents: Map<string, INodeInfo> = new Map();
        let licenses: ILicenseCacheObject[] = [{ name: 'MIT' }, { name: 'MIT/X11' }] as ILicenseCacheObject[];
        let issues: IIssueCacheObject[] = [{ issueId: 'XRAY-1' }, { issueId: 'XRAY-2' }] as IIssueCacheObject[];
        scannedComponents.set('a:b:c', {
            issues: [
                { issue_id: 'XRAY-1', component: 'a:b:c' },
                { issue_id: 'XRAY-2', component: 'a:b:c' }
            ] as IIssueKey[],
            licenses: [{ licenseName: 'MIT' }, { licenseName: 'MIT/X11' }] as ILicenseKey[]
        } as INodeInfo);

        await scanCacheManager.storeComponents(scannedComponents, issues, licenses);

        let nodeInfo: INodeInfo | undefined = scanCacheManager.getNodeInfo('a:b:c');

        assert.isDefined(nodeInfo);

        let actualIssues: IIssueKey[] | undefined = nodeInfo?.issues;
        assert.isDefined(actualIssues);
        assert.deepEqual(actualIssues, [
            { issue_id: 'XRAY-1', component: 'a:b:c' } as IIssueKey,
            { issue_id: 'XRAY-2', component: 'a:b:c' } as IIssueKey
        ]);

        let actualLicenses: ILicenseKey[] | undefined = nodeInfo?.licenses;
        assert.isDefined(actualLicenses);
        assert.deepEqual(actualLicenses, [{ licenseName: 'MIT' } as ILicenseKey, { licenseName: 'MIT/X11' } as ILicenseKey]);
    });
});
