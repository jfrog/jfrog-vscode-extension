import { DependenciesTreeNode } from './dependenciesTreeNode';
import { IComponentMetadata } from '../../goCenterClient/model/ComponentMetadata';

export class GoDependenciesTreeNode extends DependenciesTreeNode {
    private _componentMetadata!: IComponentMetadata;

    public set componentMetadata(value: IComponentMetadata) {
        this._componentMetadata = value;
    }

    public get componentMetadata(): IComponentMetadata {
        return this._componentMetadata;
    }

    public getGoCenterComponentId(): string {
        return `${this.generalInfo.artifactId}:v${this._generalInfo.version}`;
    }
}
