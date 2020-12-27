import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { MavenUtils } from '../utils/mavenUtils';
import { AbstractUpdateDependency } from './abstractDependencyUpdate';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/mavenTree';
import { ScanUtils } from '../utils/scanUtils';

export class MavenUpdateDependency extends AbstractUpdateDependency {
    constructor() {
        super(MavenUtils.PKG_TYPE);
    }

    /** @override */
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        if (!(dependenciesTreeNode.parent instanceof MavenTreeNode) || fixedVersion === '') {
            return;
        }

        const workspace: string = (<MavenTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        const [groupId, artifactId] = MavenUtils.getGavArray(dependenciesTreeNode);
        ScanUtils.executeCmd(
            'mvn versions:use-dep-version -DgenerateBackupPoms=false -Dincludes=' + groupId + ':' + artifactId + ' -DdepVersion=' + fixedVersion,
            workspace
        );
        dependenciesTreeNode.generalInfo.version = fixedVersion;
    }
}
