import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { MavenUtils } from '../utils/mavenUtils';
import { AbstractUpdateDependency } from './abstractDependencyUpdate';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/mavenTree';
import { ScanUtils } from '../utils/scanUtils';

export class MavenUpdateDependency extends AbstractUpdateDependency {
    constructor(private _treesManager: TreesManager) {
        super(MavenUtils.PKG_TYPE);
    }
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        if (!(dependenciesTreeNode.parent instanceof MavenTreeNode) || fixedVersion === '') {
            return;
        }

        const workspace: string = (<MavenTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        const [groupId, artifactId] = MavenUtils.getGavArray(dependenciesTreeNode);
        try {
            ScanUtils.executeCmd(
                'mvn versions:use-dep-version -DgenerateBackupPoms=false -Dincludes=' + groupId + ':' + artifactId + ' -DdepVersion=' + fixedVersion,
                workspace
            );
            this._treesManager.dependenciesTreeDataProvider.removeNode(dependenciesTreeNode);
        } catch (error) {
            this._treesManager.logManager.logMessage(error.stdout.toString(), 'ERR');
        }
    }
}
