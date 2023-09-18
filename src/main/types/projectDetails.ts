import * as path from 'path';
import { PackageType } from './projectType';

export class ProjectDetails {
    private _name: string;

    constructor(private _path: string, private _type: PackageType) {
        this._name = _path.substring(_path.lastIndexOf(path.sep) + 1);
    }

    public get name(): string {
        return this._name;
    }

    public set name(value: string) {
        this._name = value;
    }

    public get type(): PackageType {
        return this._type;
    }

    public set type(value: PackageType) {
        this._type = value;
    }

    public get path(): string {
        return this._path;
    }

    public set path(value: string) {
        this._path = value;
    }
}
