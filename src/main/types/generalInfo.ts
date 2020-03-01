export class GeneralInfo {
    constructor(private _artifactId: string, private _version: string, private _path: string, private _pkgType: string) {}

    public get artifactId() {
        return this._artifactId;
    }

    public get version() {
        return this._version;
    }

    public get path() {
        return this._path;
    }

    public get pkgType() {
        return this._pkgType;
    }

    public set artifactId(artifactId: string) {
        this._artifactId = artifactId;
    }

    public set version(version: string) {
        this._version = version;
    }

    public set path(path: string) {
        this._path = path;
    }

    public set pkgType(pkgType: string) {
        this._pkgType = pkgType;
    }

    public getComponentId(): string {
        return this._artifactId + ':' + this._version;
    }
}
