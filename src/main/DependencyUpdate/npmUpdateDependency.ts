import { NpmTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/npmTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { NpmUtils } from '../utils/npmUtils';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractUpdateDependency } from './abstractDependencyUpdate';

export class NpmUpdateDependency extends AbstractUpdateDependency {
    constructor(private _treesManager: TreesManager) {
        super(NpmUtils.PKG_TYPE);
    }
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        if (!(dependenciesTreeNode.parent instanceof NpmTreeNode)) {
            return;
        }
        const workspace: string = (<NpmTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        try {
            ScanUtils.executeCmd('npm install ' + dependenciesTreeNode.generalInfo.artifactId + '@' + fixedVersion, workspace);
        } catch (error) {
            this._treesManager.logManager.logMessage(error.stdout.toString(), 'ERR');
        }
    }
}
