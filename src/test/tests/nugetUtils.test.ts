import { assert } from 'chai';
import * as fs from 'fs';
import { before } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { PackageType } from '../../main/types/projectType';
import { NugetUtils } from '../../main/utils/nugetUtils';
import { ScanUtils } from '../../main/utils/scanUtils';
import { createScanCacheManager, isWindows } from './utils/utils.test';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { CacheManager } from '../../main/cache/cacheManager';

/**
 * Test functionality of @class NugetUtils.
 */
describe('Nuget Utils Tests', async () => {
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

    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'nuget'));
    let expectedDescriptors: string[] = [
        path.join(tmpDir.fsPath, 'empty/empty-proj/empty-proj.csproj'),
        path.join(tmpDir.fsPath, 'assets/api/api.csproj'),
        path.join(tmpDir.fsPath, 'assets/core/core.csproj')
    ];

    before(() => {
        workspaceFolders = [
            {
                uri: tmpDir,
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
        replacePackagesPathInAssets();
    });

    /**
     * Test NugetUtils.
     */
    it('Locate descriptors', async () => {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let descriptors: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Nuget);
        assert.isDefined(descriptors);
        for (let expectedDescriptor of expectedDescriptors) {
            assert.isDefined(
                descriptors?.find(descriptor => descriptor.fsPath === expectedDescriptor),
                'Should contain ' + expectedDescriptor
            );
        }
    });

    /**
     * Test NugetUtils.createDependenciesTrees.
     */
    it('Create NuGet Dependencies Trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));
        let res: DependenciesTreeNode[] = await runCreateNugetDependenciesTrees(parent);
        assert.equal(res.length, 2);
        // Assert dependency information
        assert.deepEqual(res[0].label, 'assets.sln');
        assert.deepEqual(res[0].parent, parent);
        assert.lengthOf(res[0].children, 2);
        assert.deepEqual(res[0].children[0].label, 'api');
        assert.lengthOf(res[0].children[0].children, 1);
        let child: DependenciesTreeNode = res[0].children[0].children[0];
        assert.deepEqual(child.componentId, 'MyLogger:1.0.0');
        assert.deepEqual(child.label, 'MyLogger');
        assert.deepEqual(child.description, '1.0.0');
        assert.deepEqual(child.parent, res[0].children[0]);
        assert.deepEqual(res[0].children[1].label, 'core');
        // Not installed
        assert.deepEqual(res[1].label, 'empty.sln [Not installed]');
        assert.lengthOf(res[1].children, 0);
    });

    async function runCreateNugetDependenciesTrees(parent: DependenciesTreeNode): Promise<DependenciesTreeNode[]> {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let solutions: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Nuget);
        assert.isDefined(solutions);
        await NugetUtils.createDependenciesTrees(solutions, treesManager, parent, () => {
            assert;
        });
        let res: DependenciesTreeNode[] = parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
        for (let child of res) {
            child.children = child.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
        }
        return res;
    }

    function replacePackagesPathInAssets() {
        const projects: string[] = ['api', 'core'];
        let packagesPath: string = path.join(tmpDir.fsPath, 'assets', 'packagesFolder');
        if (isWindows()) {
            packagesPath = packagesPath.replace(/\\/g, '\\\\');
        }
        projects.forEach(async project => {
            const fileToReplace: string = path.join(tmpDir.fsPath, 'assets', project, 'obj', 'project.assets.json');
            let content: string = fs.readFileSync(fileToReplace, { encoding: 'utf8' });
            content = content.replace(/\${PACKAGES_PATH}/g, packagesPath);
            fs.writeFileSync(fileToReplace, content, { encoding: 'utf8' });
        });
    }
});
