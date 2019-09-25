export class License {
    public static readonly UNKNOWN_LICENSE_FULL_NAME: string = 'Unknown license';
    public static readonly UNKNOWN_LICENSE: string = 'Unknown';

    constructor(private _moreInfoUrl: string[], private _components: string[], private _fullName: string, private _name: string) {}

    public createLicenseString(): string {
        if (!this.fullName && this.isFullNameEmpty()) {
            return this.name;
        }
        return this.fullName + ' (' + this.name + ')';
    }

    public isFullNameEmpty() {
        return !this.fullName || this.fullName === License.UNKNOWN_LICENSE_FULL_NAME;
    }

    public get moreInfoUrl(): string[] {
        return this._moreInfoUrl;
    }

    public get components(): string[] {
        return this._components;
    }

    public get fullName(): string {
        return this._fullName;
    }

    public get name(): string {
        return this._name;
    }

    public set moreInfoUrl(value: string[]) {
        this._moreInfoUrl = value;
    }

    public set components(value: string[]) {
        this._components = value;
    }

    public set fullName(value: string) {
        this._fullName = value;
    }

    public set name(value: string) {
        this._name = value;
    }

    public toString(): string {
        return this._name;
    }
}
