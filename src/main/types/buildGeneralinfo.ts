import { Vcs } from './vcs';
import { GeneralInfo } from './generalInfo';
import { PackageType } from './projectType';

export enum Status {
    Success,
    Failed,
    Unknown
}

export class BuildGeneralInfo extends GeneralInfo {
    constructor(
        _artifactId: string,
        private _status: Status,
        private _started?: Date | null,
        private _vcs?: Vcs,
        _version?: string,
        _path?: string,
        _scopes?: string[],
        _pkgType?: PackageType
    ) {
        super(_artifactId, _version || '', _scopes || [], _path || '', _pkgType || PackageType.Unknown);
    }

    get startedReadable(): string {
        return this._started?.toLocaleString() || '';
    }

    get startedTimestamp(): string {
        return this._started?.getTime().toString() || '';
    }

    set started(value: string) {
        this._started = new Date(value);
    }

    get status(): Status {
        return this._status;
    }

    set status(value: Status) {
        this._status = value;
    }

    get vcs(): Vcs {
        return this._vcs || new Vcs();
    }

    set vcs(value: Vcs) {
        this._vcs = value;
    }
}
