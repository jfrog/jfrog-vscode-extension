import { ComponentDetails } from 'jfrog-client-js';
import { PackageType } from './projectType';

export class ProjectDetails {
    // dependencyGAV -> ComponentDetails
    private _dependencies: Map<string, ComponentDetails> = new Map<string, ComponentDetails>();

    constructor(private _path: string, private _type: PackageType) {}

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

    public add(component: string) {
        this._dependencies.set(component, new ComponentDetails(component));
    }

    public addAll(components: string[]) {
        for (const component in components) {
            this.add(component);
        }
    }

    public toArray(): ComponentDetails[] {
        return [...this._dependencies.values()];
    }

    public slice(startIndex: number, endIndex: number): ProjectDetails {
        const partialComponents: ComponentDetails[] = this.toArray().slice(startIndex, endIndex);
        let result: ProjectDetails = new ProjectDetails(this._path, this.type);
        result.addAll(partialComponents.map(el => el.component_id));
        result.path = this.path;
        return result;
    }
}
