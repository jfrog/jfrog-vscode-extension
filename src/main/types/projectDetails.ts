import { ComponentDetails } from 'jfrog-client-js';
import * as path from 'path';
import { PackageType } from './projectType';

export class ProjectDetails {
    // dependencyGAV -> ComponentDetails
    private _dependencies: Map<string, ComponentDetails> = new Map<string, ComponentDetails>();
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

    public get componentsDetails(): Map<string, ComponentDetails> {
        return this._dependencies;
    }

    public set componentsDetails(value: Map<string, ComponentDetails>) {
        this._dependencies = value;
    }
/**
 * 
 * @param dependencyId - component id of the dependency
 */
    public addDependency(dependencyId: string) {
        this._dependencies.set(dependencyId, new ComponentDetails(dependencyId));
    }

    public toArray(): ComponentDetails[] {
        return [...this._dependencies.values()];
    }
}
