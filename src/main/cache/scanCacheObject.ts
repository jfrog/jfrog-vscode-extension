import { INodeInfo } from '../types/nodeInfo';

/**
 * Single scan cache object stored in RAM. Contains node info and timestamp.
 * Objects older then 1 week are candidates for deletion.
 */
export class ScanCacheObject {
    private static readonly MILLISECONDS_IN_WEEK: number = 604800000;
    private static readonly NOW: number = Date.now();
    private static readonly INVALIDATE_TIME: number = ScanCacheObject.NOW - ScanCacheObject.MILLISECONDS_IN_WEEK;

    private lastUpdated: number;

    public constructor(public nodeInfo: INodeInfo) {
        this.lastUpdated = ScanCacheObject.NOW;
    }

    /**
     * @returns true if the scan cache object contains the nodeInfo field and is newer than 1 week
     */
    public static isValid(scanCacheObject: ScanCacheObject): boolean {
        return !!scanCacheObject['nodeInfo'] && ScanCacheObject.INVALIDATE_TIME <= scanCacheObject.lastUpdated;
    }
}
