import { assert } from 'chai';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { IIssueCacheObject } from '../../main/types/issueCacheObject';
import { ILicenseCacheObject } from '../../main/types/licenseCacheObject';
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
});
