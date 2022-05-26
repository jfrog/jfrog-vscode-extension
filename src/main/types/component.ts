import { ComponentDetails } from 'jfrog-client-js';
import { PackageType } from './projectType';
import Set from 'typescript-collections/dist/lib/Set';

export class Components {
    private _componentsDetails: Set<ComponentDetails> = new Set(component => component.component_id);

    constructor(private _projectPath: string, private _projectType: PackageType) {}

    public get packageType(): PackageType {
        return this._projectType;
    }

    public set packageType(value: PackageType) {
        this._projectType = value;
    }

    public get projectPath(): string {
        return this._projectPath;
    }

    public set projectPath(value: string) {
        this._projectPath = value;
    }

    public get componentsDetails(): Set<ComponentDetails> {
        return this._componentsDetails;
    }

    public set componentsDetails(value: Set<ComponentDetails>) {
        this._componentsDetails = value;
    }

    public add(component: string) {
        this._componentsDetails.add(new ComponentDetails(component));
    }

    public addAll(components: string[]) {
        for (const component in components) {
            this._componentsDetails.add(new ComponentDetails(component));
        }
    }

    public slice(startIndex: number, endIndex: number): Components {
        const partialComponents: ComponentDetails[] = this._componentsDetails.toArray().slice(startIndex, endIndex);
        let result: Components = new Components(this._projectPath, this.packageType);
        result.addAll(partialComponents.map(el => el.component_id));
        result.projectPath = this.projectPath;
        return result;
    }

    public toArray(): ComponentDetails[] {
        return this._componentsDetails.toArray();
    }
}
