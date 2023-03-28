import { assert } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { ScanUtils } from '../../main/utils/scanUtils';
import { createScanCacheManager } from './utils/utils.test';
import { PackageType } from '../../main/types/projectType';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { CacheManager } from '../../main/cache/cacheManager';
import { Configuration } from '../../main/utils/configuration';
import { NpmUtils } from '../../main/utils/npmUtils';

describe('Filter npm dependencies', async () => {
    describe('Skip npm dev', async () => {
        before(async () => {
            await setSkipDevDependencies();
        });

        after(async () => {
            await unsetSkipDevDependencies();
        });

        it('Check that dev dependencies do not exist after filtering dev dependencies', async () => {
            AssertNoDevDependencies(await createNpmTree());
        });

        it('Check that prod dependencies exist after filtering dev dependencies', async () => {
            AssertProdDependenciesExist(await createNpmTree());
        });
    });

    async function AssertNoDevDependencies(deps: DependenciesTreeNode[]) {
        const devDeps: string[] = ['has-flag', '@ungap/promise-all-settled'];
        for (const dep of deps) {
            assert.isFalse(devDeps.includes(dep.generalInfo.artifactId));
        }
    }

    async function AssertProdDependenciesExist(deps: DependenciesTreeNode[]) {
        const prodDeps: string[] = ['progress', '@types/node'];
        for (const dep of deps) {
            assert.isTrue(prodDeps.includes(dep.generalInfo.artifactId));
        }
    }
});

async function createNpmTree() {
    let logManager: LogManager = new LogManager().activate();
    let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();

    let treesManager: TreesManager = new TreesManager(
        [],
        new ConnectionManager(logManager),
        dummyScanCacheManager,
        {} as ScanManager,
        {} as CacheManager,
        logManager
    );
    const workspaceFolders: vscode.WorkspaceFolder[] = [
        {
            uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'npm', 'project-4')),
            name: '',

            index: 0
        } as vscode.WorkspaceFolder
    ];
    let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));
    let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
    let packageJson: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Npm);
    await NpmUtils.createDependenciesTrees(packageJson, treesManager.logManager, () => undefined, parent);
    return parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
}

export async function setSkipDevDependencies() {
    const workspaceConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(Configuration.jfrogSectionConfigurationKey);
    await workspaceConfig.update('excludeDevDependencies', true, true);
}

export async function unsetSkipDevDependencies() {
    const workspaceConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(Configuration.jfrogSectionConfigurationKey);
    await workspaceConfig.update('excludeDevDependencies', false, true);
}
