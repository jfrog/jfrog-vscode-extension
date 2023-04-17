import * as os from 'os';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../../main/connect/connectionManager';
import { ScanCacheManager } from '../../../main/cache/scanCacheManager';
import { DependenciesTreeNode } from '../../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TestMemento } from './testMemento.test';

export function isWindows(): boolean {
    return os.platform() === 'win32';
}

export function removeWindowsWhiteSpace(text: string): string {
    return text.replace(/\r/g, '');
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

export function createScanCacheManager(): ScanCacheManager {
    return new ScanCacheManager().activate({
        workspaceState: new TestMemento() as vscode.Memento,
        storageUri: { fsPath: tmp.dirSync().name } as vscode.Uri
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
