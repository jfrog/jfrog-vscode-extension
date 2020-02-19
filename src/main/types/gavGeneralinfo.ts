import { GeneralInfo } from './generalInfo';

export class GavGeneralInfo extends GeneralInfo {
    constructor(private _groupId: string, _artifactId: string, _version: string, _path: string, _pkgType: string) {
        super(_artifactId, _version, _path, _pkgType);
    }

    public get groupId() {
        return this._groupId;
    }

    public set groupId(groupId: string) {
        this._groupId = groupId;
    }

    /** @override */
    public getComponentId(): string {
        return this.groupId + ':' + super.getComponentId();
    }
}
