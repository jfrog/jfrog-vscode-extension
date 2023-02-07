import { AbstractDependencyUpdate } from './abstractDependencyUpdate';
import { ScanUtils } from '../utils/scanUtils';
import { PackageType } from '../types/projectType';
import { DependencyIssuesTreeNode } from '../treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { MavenUtils } from '../utils/dependency/mavenUtils';

export class MavenDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(PackageType.Maven);
    }

    /** @override */
    public isMatched(dependenciesTreeNode: DependencyIssuesTreeNode): boolean {
        return super.isMatched(dependenciesTreeNode);
    }

    /** @override */
    public update(dependency: DependencyIssuesTreeNode, version: string): void {
        const workspace: string = dependency.getWorkspace();
        const [groupId, artifactId] = MavenUtils.getGavArray(dependency);
        ScanUtils.executeCmd(
            'mvn versions:use-dep-version -DgenerateBackupPoms=false -Dincludes=' + groupId + ':' + artifactId + ' -DdepVersion=' + version,
            workspace
        );
    }
}
