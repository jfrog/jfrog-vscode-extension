import { assert } from 'chai';
import { IArtifact, IGeneral, IIssue, ILicense } from 'jfrog-client-js';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { IIssueKey } from '../../main/types/issueKey';
import { INodeInfo } from '../../main/types/nodeInfo';
import { createScanCacheManager } from './utils/utils.test';

/**
 * Test functionality of @class ScanCacheManager`.
 */
describe('Scan Cache Manager Tests', () => {
    it('Store issue', () => {
        let scanCacheManager: ScanCacheManager = createScanCacheManager();
        scanCacheManager.storeIssue({ issue_id: 'XRAY-1234' } as IIssue);
        assert.isDefined(scanCacheManager.getIssue('XRAY-1234'));
    });

    it('Store license', () => {
        let scanCacheManager: ScanCacheManager = createScanCacheManager();
        scanCacheManager.storeLicense({ name: 'MIT' } as ILicense);
        assert.isDefined(scanCacheManager.getLicense('MIT'));

        scanCacheManager.storeLicense({ name: 'MIT/X11' } as ILicense);
        assert.isDefined(scanCacheManager.getLicense('MIT/X11'));
    });

    it('Store artifact components', () => {
        let scanCacheManager: ScanCacheManager = createScanCacheManager();
        let artifact: IArtifact = {
            general: { component_id: 'a:b:c', pkg_type: 'maven' } as IGeneral,
            issues: [{ issue_id: 'XRAY-1' }, { issue_id: 'XRAY-2' }],
            licenses: [{ name: 'MIT' }, { name: 'MIT/X11' }]
        } as IArtifact;
        scanCacheManager.storeArtifactComponents([artifact]);

        let nodeInfo: INodeInfo | undefined = scanCacheManager.getNodeInfo('a:b:c');

        assert.isDefined(nodeInfo);
        assert.equal(nodeInfo?.pkg_type, 'maven');

        let actualIssues: IIssueKey[] | undefined = nodeInfo?.issues;
        assert.isDefined(actualIssues);
        assert.deepEqual(actualIssues, [{ issue_id: 'XRAY-1' } as IIssueKey, { issue_id: 'XRAY-2' } as IIssueKey]);

        let actualLicenses: string[] | undefined = nodeInfo?.licenses;
        assert.isDefined(actualLicenses);
        assert.deepEqual(actualLicenses, ['MIT', 'MIT/X11']);
    });
});
