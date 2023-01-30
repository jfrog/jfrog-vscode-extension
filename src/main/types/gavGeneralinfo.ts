import { GeneralInfo } from './generalInfo';
import { PackageType } from './projectType';

export class GavGeneralInfo extends GeneralInfo {
    constructor(private _groupId: string, _artifactId: string, _version: string, _scope: string[], _path: string, _pkgType: PackageType) {
        super(_artifactId, _version, _scope, _path, _pkgType);
    }

    public get groupId(): string {
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
