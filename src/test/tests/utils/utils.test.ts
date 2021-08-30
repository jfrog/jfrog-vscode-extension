import * as os from 'os';
import { DependenciesTreeNode } from '../../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';

export function isWindows(): boolean {
    return os.platform() === 'win32';
}

export function getNodeByArtifactId(root: DependenciesTreeNode, artifactId: string): DependenciesTreeNode | null {
    if (root === null) {
        return null;
    }
    for (let i: number = 0; i < root.children.length; i++) {
        if (root.children[i].generalInfo.artifactId === artifactId) {
            return root.children[i];
        }
        const res: DependenciesTreeNode | null = getNodeByArtifactId(root.children[i], artifactId);
        if (res !== null) {
            return res;
        }
    }
    return null;
}
