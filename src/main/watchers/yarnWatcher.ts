import { AbstractWatcher } from './abstractWatcher';
import { TreesManager } from '../treeDataProviders/treesManager';

export class YarnWatcher extends AbstractWatcher {
    constructor(protected treesManager: TreesManager) {
        super(treesManager, '**/yarn.lock');
    }
}
