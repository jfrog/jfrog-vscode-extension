export class Dependency {
    constructor(
        private _id: string,
        private _scopes: string[],
        private _requestedBy: string[][],
        private _type: string,
        private _sha1?: string,
        private _sha256?: string
    ) {}

    public get id(): string {
        return this._id;
    }

    public get scopes(): string[] {
        return this._scopes;
    }

    public get requestedBy(): string[][] {
        return this._requestedBy;
    }

    public set id(id: string) {
        this._id = id;
    }

    public set scopes(scopes: string[]) {
        this._scopes = scopes;
    }

    public set requestedBy(requestedBy: string[][]) {
        this._requestedBy = requestedBy;
    }

    get type(): string {
        return this._type;
    }

    set type(value: string) {
        this._type = value;
    }

    get sha1(): string | undefined {
        return this._sha1;
    }

    get sha256(): string | undefined {
        return this._sha256;
    }
}
