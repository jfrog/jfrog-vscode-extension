import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { AbstractFocus } from './abstractFocus';
import { NpmFocus } from './npmFocus';
import { ExtensionComponent } from '../extensionComponent';
import * as vscode from 'vscode';
import { GoFocus } from './goFocus';

/**
 * Show the dependency in the project descriptor (i.e package.json) file after right click on the components tree and a left click on "Show in project descriptor".
 */
export class FocusManager implements ExtensionComponent {
    private _focuses: AbstractFocus[] = [];

    constructor() {
        this._focuses.push(new NpmFocus('npm'), new GoFocus('go'));
    }

    public activate(context: vscode.ExtensionContext) {
        return this;
    }

    public focusOnDependency(dependenciesTreeNode: DependenciesTreeNode) {
        this._focuses.filter(focus => focus.isMatched(dependenciesTreeNode)).forEach(focus => focus.focusOnDependency(dependenciesTreeNode));
    }
}
