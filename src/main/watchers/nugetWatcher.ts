import { AbstractWatcher } from './abstractWatcher';
import { TreesManager } from '../treeDataProviders/treesManager';

export class NugetWatcher extends AbstractWatcher {
    constructor(protected treesManager: TreesManager) {
        super(treesManager, '**/*.sln');
    }
}
