import { GoTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { GoUtils } from '../utils/goUtils';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractUpdateDependency } from './abstractDependencyUpdate';

export class GoUpdateDependency extends AbstractUpdateDependency {
    constructor(private _treesManager: TreesManager) {
        super(GoUtils.PKG_TYPE);
    }
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        if (!(dependenciesTreeNode.parent instanceof GoTreeNode)) {
            return;
        }
        const workspace: string = (<GoTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        try {
            ScanUtils.executeCmd('go get ' + dependenciesTreeNode.generalInfo.artifactId + '@v' + fixedVersion, workspace);
        } catch (error) {
            this._treesManager.logManager.logMessage(error.stdout.toString(), 'ERR');
        }
    }
}
