import { ScanResults } from '../types/workspaceIssuesDetails';

/**
 * Represents a cached record of workspace issues data.
 */
export class CacheRecord {
    private static readonly MAX_CACHE_AGE_MILLISECS: number = 1000 * 60 * 60 * 24 * 7;
    public static readonly CURRENT_CACHE_VERSION: number = 1;

    constructor(private _data?: ScanResults, private _timestamp?: number, private _version?: number) {}

    public static fromJson(rawJson: string | undefined): CacheRecord {
        if (rawJson === undefined) {
            return new CacheRecord();
        }
        const json: any = JSON.parse(rawJson);
        return new CacheRecord(json._data, json._timestamp, json._version);
    }

    public get timestamp(): number | undefined {
        return this._timestamp;
    }

    public get version(): number | undefined {
        return this._version;
    }

    public get data(): any | undefined {
        return this._data;
    }

    public isValid(): boolean {
        return this.hasValidData() && this.isNotExpired() && this.hasCurrentVersion();
    }

    private hasValidData(): boolean {
        return this._data !== undefined;
    }

    private isNotExpired(): boolean {
        return this._timestamp !== undefined && Date.now() - this._timestamp <= CacheRecord.MAX_CACHE_AGE_MILLISECS;
    }

    private hasCurrentVersion(): boolean {
        return this._version !== undefined && this._version === CacheRecord.CURRENT_CACHE_VERSION;
    }
}
