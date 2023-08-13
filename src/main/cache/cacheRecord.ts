import { ScanResults } from '../types/workspaceIssuesDetails';

/**
 * Represents a cached record of workspace issues data.
 */
export class CacheRecord {
    constructor(private _data?: ScanResults, private _timestamp?: number, private _version?: number) {}

    public static fromJson(rawJson: string): CacheRecord {
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
}
