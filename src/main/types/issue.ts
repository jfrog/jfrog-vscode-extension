import { Severity } from './severity';

export class Issue {
    public static readonly MISSING_COMPONENT: Issue = new Issue('Component is missing in Xray', Severity.Unknown, '', 'Unknown');
    private _component: string = '';

    constructor(
        private _summary: string,
        private _severity: Severity = Severity.Normal,
        private _description: string,
        private _issueType: string,
        private _fixedVersions: string[] = [],
        private _gocenter_security_url?: string
    ) {}

    public get description(): string {
        return this._description;
    }

    public get issueType(): string {
        return this._issueType;
    }

    public get severity(): Severity {
        return this._severity;
    }

    public get summary(): string {
        return this._summary;
    }

    public get component(): string {
        return this._component || '';
    }

    public get fixedVersions(): string[] {
        return this._fixedVersions;
    }

    public get gocenter_security_url(): string | undefined {
        return this._gocenter_security_url;
    }

    public set description(value: string) {
        this._description = value;
    }

    public set issueType(value: string) {
        this._issueType = value;
    }

    public set severity(value: Severity) {
        this._severity = value;
    }

    public set summary(value: string) {
        this._summary = value;
    }

    public set component(value: string) {
        this._component = value;
    }

    public set fixedVersions(value: string[]) {
        this._fixedVersions = value;
    }

    public set gocenter_security_url(value: string | undefined) {
        this._gocenter_security_url = value;
    }
}
