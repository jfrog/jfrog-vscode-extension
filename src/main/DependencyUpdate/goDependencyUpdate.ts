import { GoTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GoUtils } from '../utils/goUtils';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractUpdateDependency } from './abstractDependencyUpdate';

export class GoUpdateDependency extends AbstractUpdateDependency {
    constructor() {
        super(GoUtils.PKG_TYPE);
    }

    /** @override */
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        if (!(dependenciesTreeNode.parent instanceof GoTreeNode)) {
            return;
        }
        const workspace: string = (<GoTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        ScanUtils.executeCmd('go get ' + dependenciesTreeNode.generalInfo.artifactId + '@v' + fixedVersion, workspace);
        dependenciesTreeNode.generalInfo.version = fixedVersion;
    }
}
