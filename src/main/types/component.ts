import { ComponentDetails } from 'jfrog-client-js';
import { PackageType } from './projectType';
import Set from 'typescript-collections/dist/lib/Set';

export class Components {
    private _componentsDetails: Map<string, ComponentDetails> = new Map<string, ComponentDetails>();

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

    public get componentsDetails(): Map<string, ComponentDetails> {
        return this._componentsDetails;
    }

    public set componentsDetails(value: Map<string, ComponentDetails>) {
        this._componentsDetails = value;
    }

    public add(component: string) {
        this._componentsDetails.set(component, new ComponentDetails(component));
    }

    public addAll(components: string[]) {
        for (const component in components) {
            this.add(component);
        }
    }
    public toArray(): ComponentDetails[] {
        return [...this._componentsDetails.values()];
    }

    public toHashSet(): Set<ComponentDetails> {
        let result: Set<ComponentDetails> = new Set<ComponentDetails>();
        for (let value of this.toArray()) {
            result.add(value);
        }
        return result;
    }

    public slice(startIndex: number, endIndex: number): Components {
        const partialComponents: ComponentDetails[] = this.toArray().slice(startIndex, endIndex);
        let result: Components = new Components(this._projectPath, this.packageType);
        result.addAll(partialComponents.map(el => el.component_id));
        result.projectPath = this.projectPath;
        return result;
    }
}
