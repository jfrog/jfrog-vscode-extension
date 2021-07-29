import { Severity } from './severity';

export class Issue {
    public static readonly MISSING_COMPONENT: Issue = new Issue('Component is missing in Xray', 2, '', 'Unknown');

    constructor(
        private _summary: string,
        private _severity: Severity = Severity.Normal,
        private _description: string,
        private _issueType: string,
        private _fixedVersions: string[] = [],
        private _cves?: string[]
    ) {
        this._fixedVersions = this._fixedVersions.map(fixedVersion => {
            if (fixedVersion.startsWith('[') && fixedVersion.endsWith(']')) {
                return fixedVersion.substring(1, fixedVersion.length - 1);
            }
            return fixedVersion;
        });
    }

    public get cves(): string[] | undefined {
        return this._cves;
    }

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

    public get fixedVersions(): string[] {
        return this._fixedVersions;
    }

    public set cves(cves: string[] | undefined) {
        this._cves = cves;
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

    public set fixedVersions(value: string[]) {
        this._fixedVersions = value;
    }
}
