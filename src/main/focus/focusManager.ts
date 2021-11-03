import { ExtensionComponent } from '../extensionComponent';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { AbstractFocus, FocusType } from './abstractFocus';
import { GoFocus } from './goFocus';
import { MavenFocus } from './mavenFocus';
import { NpmFocus } from './npmFocus';
import { PypiFocus } from './pypiFocus';

/**
 * Show the dependency in the project descriptor (i.e package.json) file after right click on the components tree and a left click on "Show in project descriptor".
 */
export class FocusManager implements ExtensionComponent {
    private _focuses: AbstractFocus[] = [];

    constructor() {
        this._focuses.push(new NpmFocus(), new PypiFocus(), new GoFocus(), new MavenFocus());
    }

    public activate() {
        return this;
    }

    public focusOnDependency(dependenciesTreeNode: DependenciesTreeNode, focusType: FocusType) {
        this._focuses
            .filter(focus => focus.isMatched(dependenciesTreeNode))
            .forEach(focus => focus.focusOnDependency(dependenciesTreeNode, focusType));
    }
}
