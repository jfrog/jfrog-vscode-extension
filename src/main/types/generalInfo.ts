export class GeneralInfo {
    constructor(
        private _artifactId: string,
        private _version: string,
        private _scopes: string[],
        private _path: string,
        private _pkgType: string,
        private _sha1?: string,
        private _sha256?: string
    ) {}

    public get artifactId(): string {
        return this._artifactId;
    }

    public get version(): string {
        return this._version;
    }

    public get scopes(): string[] {
        return this._scopes;
    }

    public get path(): string {
        return this._path;
    }

    public get pkgType(): string {
        return this._pkgType;
    }

    public get sha1(): string | undefined {
        return this._sha1;
    }

    public get sha256(): string | undefined {
        return this._sha256;
    }

    public set artifactId(artifactId: string) {
        this._artifactId = artifactId;
    }

    public set version(version: string) {
        this._version = version;
    }

    public set scopes(scopes: string[]) {
        this._scopes = scopes;
    }

    public set path(path: string) {
        this._path = path;
    }

    public set pkgType(pkgType: string) {
        this._pkgType = pkgType;
    }

    public set sha1(sha1: string | undefined) {
        this._sha1 = sha1;
    }

    public set sha256(sha1: string | undefined) {
        this._sha1 = sha1;
    }

    public getComponentId(): string {
        return this._artifactId + ':' + this._version;
    }

    public update(newGeneralInfo: GeneralInfo) {
        if (newGeneralInfo._artifactId !== '') {
            this.artifactId = newGeneralInfo.artifactId;
        }
        if (newGeneralInfo.path !== '') {
            this.path = newGeneralInfo.path;
        }
        if (newGeneralInfo.pkgType !== '') {
            this.pkgType = newGeneralInfo.pkgType;
        }
        if (newGeneralInfo.scopes.length !== 0) {
            this.scopes = newGeneralInfo.scopes;
        }
        if (newGeneralInfo.version !== '') {
            this.version = newGeneralInfo.version;
        }
        if (newGeneralInfo.sha1 !== '') {
            this.sha1 = newGeneralInfo.sha1;
        }
    }
}
