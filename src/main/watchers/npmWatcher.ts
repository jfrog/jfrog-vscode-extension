import { AbstractWatcher } from './abstractWatcher';
import { TreesManager } from '../treeDataProviders/treesManager';

export class NpmWatcher extends AbstractWatcher {
    constructor(protected treesManager: TreesManager) {
        super(treesManager, '**/package-lock.json');
    }
}
