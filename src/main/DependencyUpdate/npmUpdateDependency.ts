import { NpmTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/npmTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { NpmUtils } from '../utils/npmUtils';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractUpdateDependency } from './abstractDependencyUpdate';

export class NpmUpdateDependency extends AbstractUpdateDependency {
    constructor() {
        super(NpmUtils.PKG_TYPE);
    }

    /** @override */
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        if (!(dependenciesTreeNode.parent instanceof NpmTreeNode)) {
            return;
        }
        const workspace: string = (<NpmTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        ScanUtils.executeCmd('npm install ' + dependenciesTreeNode.generalInfo.artifactId + '@' + fixedVersion, workspace);
        dependenciesTreeNode.generalInfo.version = fixedVersion;
    }
}
