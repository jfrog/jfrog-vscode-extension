import { GoTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GoUtils } from '../utils/goUtils';
import { ScanUtils } from '../utils/scanUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

export class GoDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(GoUtils.PKG_TYPE);
    }

    /** @override */
    public isMatched(dependenciesTreeNode: DependenciesTreeNode): boolean {
        return super.isMatched(dependenciesTreeNode) && dependenciesTreeNode.parent instanceof GoTreeNode;
    }

    /** @override */
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        const workspace: string = (<GoTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        ScanUtils.executeCmd('go get ' + dependenciesTreeNode.generalInfo.artifactId + '@v' + fixedVersion, workspace);
        dependenciesTreeNode.generalInfo.version = fixedVersion;
    }
}
