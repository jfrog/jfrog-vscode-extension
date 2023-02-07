import * as os from 'os';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../../main/connect/connectionManager';
import { ScanCacheManager } from '../../../main/cache/scanCacheManager';
import { DependencyTreeNode } from '../../../main/dependencyTree/dependencyTreeNode';
import { TestMemento } from './testMemento.test';

export function isWindows(): boolean {
    return os.platform() === 'win32';
}

export function getNodeByArtifactId(root: DependencyTreeNode, artifactId: string): DependencyTreeNode | null {
    if (root === null) {
        return null;
    }
    for (let i: number = 0; i < root.children.length; i++) {
        if (root.children[i].generalInfo.artifactId === artifactId) {
            return root.children[i];
        }
        const res: DependencyTreeNode | null = getNodeByArtifactId(root.children[i], artifactId);
        if (res !== null) {
            return res;
        }
    }
    return null;
}

export function createScanCacheManager(): ScanCacheManager {
    return new ScanCacheManager().activate({
        workspaceState: new TestMemento() as vscode.Memento,
        storagePath: tmp.dirSync().name
    } as vscode.ExtensionContext);
}

export function createConnectionManager(): ConnectionManager {
    return {} as ConnectionManager;
}

export function getCliHomeDir(): string {
    return process.env['JFROG_CLI_HOME_DIR'] || '';
}

export function setCliHomeDir(newHome: string): void {
    process.env['JFROG_CLI_HOME_DIR'] = newHome;
}

// export function create
