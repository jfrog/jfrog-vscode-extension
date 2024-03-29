import * as vscode from 'vscode';
import * as path from 'path';
import { LogManager } from '../log/logManager';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { ScanUtils } from './scanUtils';
import { PnpmTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/pnpmTree';
import { Configuration } from './configuration';

export class PnpmUtils {
    public static readonly DESCRIPTOR: string = 'package.json';
    public static readonly DOCUMENT_SELECTOR: vscode.DocumentSelector = { scheme: 'file', pattern: '**/' + PnpmUtils.DESCRIPTOR };
    public static readonly SKIP_DEV_DEPENDENCIES_FLAG: string = '--prod';

    public static async createDependenciesTrees(
        pnpmLocks: vscode.Uri[] | undefined,
        logManager: LogManager,
        checkCanceled: () => void,
        parent: DependenciesTreeNode
    ): Promise<void> {
        if (!pnpmLocks) {
            logManager.logMessage('No pnpm-lock.yaml files found in workspaces.', 'DEBUG');
            return;
        }
        if (!PnpmUtils.verifyPnpmInstalled()) {
            logManager.logError(new Error('Could not scan pnpm project dependencies, because pnpm CLI is not in the PATH.'), true);
            return;
        }
        let packageJsons: string[] = PnpmUtils.pnpmLockToPackageJson(pnpmLocks);
        logManager.logMessage(PnpmUtils.DESCRIPTOR + ' files to scan: [' + packageJsons.toString() + ']', 'DEBUG');
        for (let packageJson of packageJsons) {
            checkCanceled();
            let root: PnpmTreeNode = new PnpmTreeNode(packageJson, logManager, parent);
            await root.refreshDependencies();
        }
    }

    public static verifyPnpmInstalled(): boolean {
        try {
            ScanUtils.executeCmd('pnpm --version');
        } catch (error) {
            return false;
        }
        return true;
    }

    public static runPnpmLs(workspace: string): any {
        let args: string[] = ['pnpm', 'ls', '--depth', 'Infinity', '--json', '--long'];
        let skipFlag: string = PnpmUtils.getSkipDevDependenciesFlag();
        if (skipFlag !== '') {
            args.push(skipFlag);
        }
        return JSON.parse(ScanUtils.executeCmd(args.join(' '), workspace).toString());
    }

    protected static getSkipDevDependenciesFlag(): string {
        if (!Configuration.excludeDevDependencies()) {
            return '';
        }
        return PnpmUtils.SKIP_DEV_DEPENDENCIES_FLAG;
    }

    public static runPnpmInstall(workspace: string): void {
        ScanUtils.executeCmd(['pnpm', 'install'].join(' '), workspace).toString();
    }

    public static pnpmLockToPackageJson(paths: vscode.Uri[]): string[] {
        return paths.map(pnpmLock => path.join(path.dirname(pnpmLock.fsPath), PnpmUtils.DESCRIPTOR));
    }
}
