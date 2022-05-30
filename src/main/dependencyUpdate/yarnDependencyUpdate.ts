import { YarnTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/yarnTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { ScanUtils } from '../utils/scanUtils';
import { YarnUtils } from '../utils/yarnUtils';
import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

export class YarnDependencyUpdate extends AbstractDependencyUpdate {
    constructor() {
        super(YarnUtils.PKG_TYPE);
    }

    /** @override */
    public isMatched(dependenciesTreeNode: DependenciesTreeNode): boolean {
        return super.isMatched(dependenciesTreeNode) && dependenciesTreeNode.parent instanceof YarnTreeNode;
    }

    /** @override */
    public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
        const workspace: string = (<YarnTreeNode>dependenciesTreeNode.parent).workspaceFolder;
        ScanUtils.executeCmd('yarn upgrade ' + dependenciesTreeNode.generalInfo.artifactId + '@' + fixedVersion, workspace);
        dependenciesTreeNode.generalInfo.version = fixedVersion;
    }
}
