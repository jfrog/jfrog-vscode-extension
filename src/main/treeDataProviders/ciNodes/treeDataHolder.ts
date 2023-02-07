/**
 * Stores {key, value, link} information for the component details and component issues details trees.
 */
import * as vscode from 'vscode';

export class TreeDataHolder {
    constructor(
        private _key: string,
        private _value?: string,
        private _link?: string,
        private _icon?: string,
        private _toolTip?: string,
        private _command?: vscode.Command,
        private _context?: string
    ) {}

    public get key(): string {
        return this._key;
    }

    public get value(): string | undefined {
        return this._value;
    }

    public get link(): string | undefined {
        return this._link;
    }

    public get icon(): string | undefined {
        return this._icon;
    }

    public get toolTip(): string | undefined {
        return this._toolTip;
    }

    public get command(): vscode.Command | undefined {
        return this._command;
    }

    public set command(value: vscode.Command | undefined) {
        this._command = value;
    }

    public get context(): string | undefined {
        return this._context;
    }

    public set context(value: string | undefined) {
        this._context = value;
    }
}
