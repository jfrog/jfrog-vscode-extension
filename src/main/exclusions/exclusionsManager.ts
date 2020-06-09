import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { AbstractExclusion } from './abstractExclusion';
import { MavenExclusion } from './mavenExclusion';
/**
 * Show the dependency in the project descriptor (i.e package.json) file after right click on the components tree and a left click on "Show in project descriptor".
 */
export class ExclusionsManager implements ExtensionComponent {
    private _exclusions: AbstractExclusion[] = [];

    constructor() {
        this._exclusions.push(new MavenExclusion());
    }

    public activate(context: vscode.ExtensionContext) {
        return this;
    }

    public excludeDependency(dependenciesTreeNode: DependenciesTreeNode) {
        this._exclusions
            .filter(focus => focus.isMatched(dependenciesTreeNode))
            .forEach(exclusion => exclusion.excludeDependency(dependenciesTreeNode));
    }
}
