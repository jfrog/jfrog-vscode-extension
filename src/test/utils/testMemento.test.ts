import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';

export class TestMemento implements vscode.Memento {
    storage: Collections.Dictionary<string, any>;
    constructor() {
        this.storage = new Collections.Dictionary<string, any>();
    }
    keys(): readonly string[] {
        return this.storage.keys();
    }
    get(key: any) {
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
