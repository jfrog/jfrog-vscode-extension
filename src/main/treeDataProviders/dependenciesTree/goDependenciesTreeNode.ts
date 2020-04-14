import { DependenciesTreeNode } from './dependenciesTreeNode';
import { IComponentMetadata } from '../../goCenterClient/model/ComponentMetadata';
export class GoDependenciesTreeNode extends DependenciesTreeNode {
    private _goCenter!: IComponentMetadata;

    public set goCenter(value: IComponentMetadata) {
        this._goCenter = value;
    }

    public get goCenter(): IComponentMetadata {
        return this._goCenter;
    }
    public loadMetaData(metaData: IComponentMetadata) {
        this._goCenter = { ...metaData };
    }

    public getGoCenterComponentId(): string {
        return `${this.generalInfo.artifactId}:v${this._generalInfo.version}`;
    }
}
