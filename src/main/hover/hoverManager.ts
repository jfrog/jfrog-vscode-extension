import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { TreesManager } from '../treeDataProviders/treesManager';
import { AbstractHoverProvider } from './abstractHoverProvider';
import { GoHover } from './goHover';
import { NpmHover } from './npmHover';
import { PypiHover } from './pypiHover';
import { MavenHover } from './mavenHover';

/**
 * Hover on a dependency in the project descriptor (i.e. package.json) to show its licenses.
 */
export class HoverManager implements ExtensionComponent {
    private _hoverProviders: AbstractHoverProvider[] = [];

    constructor(treesManager: TreesManager) {
        this._hoverProviders.push(new NpmHover(treesManager), new PypiHover(treesManager), new GoHover(treesManager), new MavenHover(treesManager));
    }

    public activate(context: vscode.ExtensionContext) {
        this._hoverProviders.forEach(hover => hover.activate(context));
    }
}
