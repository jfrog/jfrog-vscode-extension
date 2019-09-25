/**
 * Stores {key, value, link} information for the component details and component issues details trees.
 */
export class TreeDataHolder {
    constructor(private _key: string, private _value?: string, private _link?: string) {}

    public get key(): string {
        return this._key;
    }

    public get value(): string | undefined {
        return this._value;
    }

    public get link(): string | undefined {
        return this._link;
    }
}
