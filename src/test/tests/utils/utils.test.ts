import * as fs from 'fs';
import { JfrogClient } from 'jfrog-client-js';
import * as os from 'os';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { ScanCacheManager } from '../../../main/cache/scanCacheManager';
import { ConnectionManager } from '../../../main/connect/connectionManager';
import { ConnectionUtils } from '../../../main/connect/connectionUtils';
import { ContextKeys, SessionStatus } from '../../../main/constants/contextKeys';
import { LogManager } from '../../../main/log/logManager';
import { AnalyzerDriver, AnalyzerScanResponse, AnalyzerScanRun } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { DependenciesTreeNode } from '../../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { StepProgress } from '../../../main/treeDataProviders/utils/stepProgress';
import { TestMemento } from './testMemento.test';

export function isWindows(): boolean {
    return os.platform() === 'win32';
}

export function removeWindowsWhiteSpace(text: string): string {
    return text.replace(/\r/g, '');
}

export function getAnalyzerScanResponse(filePath: string | undefined): AnalyzerScanResponse | undefined {
    if (!filePath || !fs.existsSync(filePath)) {
        return undefined;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8').toString());
}

export function getEmptyAnalyzerScanResponse(): AnalyzerScanResponse {
    return { runs: [{ tool: { driver: { name: 'dummy', rules: [] } as AnalyzerDriver } } as AnalyzerScanRun] } as AnalyzerScanResponse;
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

export async function createTestConnectionManager(logManager: LogManager, timeout?: number, retry?: number): Promise<ConnectionManager> {
    return await new ConnectionManagerWrapper(logManager, timeout, retry).activate({
        globalState: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            get(key: string) {
                if (key == ContextKeys.SESSION_STATUS) {
                    return SessionStatus.SignedOut;
                }
                return;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            update(key: string, value: any) {
                return;
            }
        } as vscode.Memento
    } as vscode.ExtensionContext);
}

export function createTestStepProgress(): StepProgress {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return new StepProgress({} as vscode.Progress<{ message?: string; increment?: number }>, () => {});
}

export class ConnectionManagerWrapper extends ConnectionManager {
    constructor(logManager: LogManager, private _timeout?: number, private _retry?: number) {
        super(logManager);
    }

    /** @override */
    public createJfrogClient(): JfrogClient {
        return ConnectionUtils.createJfrogClient(
            this.url,
            this.rtUrl,
            this.xrayUrl,
            this.username,
            this.password,
            this.accessToken,
            this._retry,
            this._timeout
        );
    }
}

export function getCliHomeDir(): string {
    return process.env['JFROG_CLI_HOME_DIR'] || '';
}

export function setCliHomeDir(newHome: string): void {
    process.env['JFROG_CLI_HOME_DIR'] = newHome;
}
