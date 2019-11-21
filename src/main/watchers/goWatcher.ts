import { AbstractWatcher } from './abstractWatcher';
import { TreesManager } from '../treeDataProviders/treesManager';

export class GoWatcher extends AbstractWatcher {
    constructor(protected treesManager: TreesManager) {
        super(treesManager, '**/go.sum');
    }
}
