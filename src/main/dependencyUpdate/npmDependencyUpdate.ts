// import { NpmTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/npmTree';
// import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
// import { NpmUtils } from '../utils/npmUtils';
// import { ScanUtils } from '../utils/scanUtils';
// import { AbstractDependencyUpdate } from './abstractDependencyUpdate';

// export class NpmDependencyUpdate extends AbstractDependencyUpdate {
//     constructor() {
//         super(NpmUtils.PKG_TYPE);
//     }

//     /** @override */
//     public isMatched(dependenciesTreeNode: DependenciesTreeNode): boolean {
//         return super.isMatched(dependenciesTreeNode) && dependenciesTreeNode.parent instanceof NpmTreeNode;
//     }

//     /** @override */
//     public updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode, fixedVersion: string): void {
//         const workspace: string = (<NpmTreeNode>dependenciesTreeNode.parent).workspaceFolder;
//         ScanUtils.executeCmd('npm install ' + dependenciesTreeNode.generalInfo.artifactId + '@' + fixedVersion, workspace);
//         dependenciesTreeNode.generalInfo.version = fixedVersion;
//     }
// }
