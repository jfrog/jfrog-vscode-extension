import { IArtifact } from 'xray-client-js';
import { IComponentMetadata } from '../goCenterClient/model/ComponentMetadata';

export class ScanCacheObject {
    private static readonly MILLISECONDS_IN_WEEK: number = 604800000;
    private static readonly NOW: number = Date.now();
    private static readonly INVALIDATE_TIME: number = ScanCacheObject.NOW - ScanCacheObject.MILLISECONDS_IN_WEEK;

    public _lastUpdated: number;

    private constructor(public _artifact: IArtifact, public _componentMetadata: IComponentMetadata) {
        this._lastUpdated = ScanCacheObject.NOW;
    }

    public static isInvalid(lastUpdated: number): boolean {
        return lastUpdated < ScanCacheObject.INVALIDATE_TIME;
    }

    static createXrayCache(artifact: IArtifact) {
        return new this(artifact, {} as IComponentMetadata);
    }

    static createGoCenterCache(componentMetadata: IComponentMetadata) {
        return new this({} as IArtifact, componentMetadata);
    }
}
