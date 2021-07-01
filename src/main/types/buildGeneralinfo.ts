import { Vcs } from './vcs';
import {GeneralInfo} from "./generalInfo";

export enum Status {
    PASSED,
    FAILED,
    UNKNOWN
}

export class BuildGeneralInfo extends GeneralInfo {
    constructor(
        _artifactId: string,
        _version?: string,
        _path?: string,
        _scopes?: string[],
        _pkgType?: string,
        private _started?: Date | null,
        private _status?: Status,
        private _vcs?: Vcs,
    ) {
        super(_artifactId, _version || '', _scopes || [], _path || '', _pkgType || '');
    }

    get started(): string {
        return this._started?.toLocaleString() || '';
    }

    set started(value: string) {
        this._started = new Date(value);
    }

    get status(): Status {
        return this._status || Status.UNKNOWN;
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
