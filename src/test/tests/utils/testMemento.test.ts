import * as vscode from 'vscode';
import * as Collections from 'typescript-collections';

export class TestMemento implements vscode.Memento {
    storage: Collections.Dictionary<string, any>;
    constructor() {
        this.storage = new Collections.Dictionary<string, any>();
    }
    get(key: any, defaultValue?: any) {
        if (typeof key === 'string') {
            return this.storage.getValue(key);
        }
        return;
    }
    update(key: string, value: any): Thenable<void> {
        this.storage.setValue(key, value);
        return Promise.resolve();
    }
}
