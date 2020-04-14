import { IArtifact } from 'xray-client-js';
import { IComponentMetadata } from '../goCenterClient/model/ComponentMetadata';

export class ScanCacheObject {
    private static readonly MILLISECONDS_IN_WEEK: number = 604800000;
    private static readonly NOW: number = Date.now();
    private static readonly INVALIDATE_TIME: number = ScanCacheObject.NOW - ScanCacheObject.MILLISECONDS_IN_WEEK;

    public _artifact!: IArtifact;
    public _ComponentMetadata!: IComponentMetadata;
    public _lastUpdated: number;

    constructor() {
        this._lastUpdated = ScanCacheObject.NOW;
    }

    public static isInvalid(lastUpdated: number): boolean {
        return lastUpdated < ScanCacheObject.INVALIDATE_TIME;
    }

    setArtifact(artifact: IArtifact) {
        this._artifact = artifact;
        return this;
    }

    setComponentMetadata(componentMetadata: IComponentMetadata) {
        this._ComponentMetadata = componentMetadata;
        return this;
    }
}
