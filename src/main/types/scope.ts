export class Scope {
    constructor(private _label: string) {}

    public get label(): string {
        return this._label;
    }
    public set label(value: string) {
        this._label = value;
    }

    public toString(): string {
        return this._label;
    }
}
