export class Vcs {
    constructor(private _revision?: string, private _message?: string, private _branch?: string, private _url?: string) {}
    get revision(): string {
        return this._revision || '';
    }

    set revision(value: string) {
        this._revision = value;
    }

    get message(): string {
        return this._message || '';
    }

    set message(value: string) {
        this._message = value;
    }

    get branch(): string {
        return this._branch || '';
    }

    set branch(value: string) {
        this._branch = value;
    }

    get url(): string {
        return this._url || '';
    }

    set url(value: string) {
        this._url = value;
    }
}
