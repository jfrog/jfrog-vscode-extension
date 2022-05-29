import { assert } from 'chai';
import * as fs from 'fs';
import { before } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { ScanLogicManager } from '../../main/scanLogic/scanLogicManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { PackageType } from '../../main/types/projectType';
import { NugetUtils } from '../../main/utils/nugetUtils';
import { ScanUtils } from '../../main/utils/scanUtils';
import { createScanCacheManager, isWindows } from './utils/utils.test';
import { ProjectDetails } from '../../main/types/component';

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
        {} as ScanLogicManager,
        logManager
    );
    let solutionsDirs: string[] = ['assets', 'empty'];
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'nuget'));

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
     * Test NugetUtils.locateSolutions.
     */
    it('Locate solutions', async () => {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let solutions: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.NUGET);
        assert.isDefined(solutions);
        assert.strictEqual(solutions?.length, solutionsDirs.length);

        // Assert that results contains all solutions.
        for (let expectedSolutionDir of solutionsDirs) {
            let expectedSolution: string = path.join(tmpDir.fsPath, expectedSolutionDir, expectedSolutionDir + '.sln');
            assert.isDefined(
                solutions?.find(solutions => solutions.fsPath === expectedSolution),
                'Should contain ' + expectedSolution
            );
        }
    });

    /**
     * Test NugetUtils.createDependenciesTrees.
     */
    it('Create NuGet Dependencies Trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: ProjectDetails[] = [];
        let res: DependenciesTreeNode[] = await runCreateNugetDependenciesTrees(componentsToScan, parent);

        // Check that components to scan contains MyLogger:1.0.0
        assert.equal(componentsToScan.length, 1);
        assert.deepEqual(componentsToScan[0].toArray()[0].component_id, 'nuget://MyLogger:1.0.0');

        // Check labels
        assert.deepEqual(res[0].label, 'api');
        assert.deepEqual(res[1].label, 'core');

        // Check parents
        assert.deepEqual(res[0].parent, parent);
        assert.deepEqual(res[1].parent, parent);

        // Check children
        assert.lengthOf(res[0].children, 1);
        assert.lengthOf(res[1].children, 1);
        assert.deepEqual(res[0].children[0].label, res[1].children[0].label);
        let child: DependenciesTreeNode = res[0].children[0];
        assert.deepEqual(child.componentId, 'MyLogger:1.0.0');
        assert.deepEqual(child.label, 'MyLogger');
        assert.deepEqual(child.description, '1.0.0');
        assert.deepEqual(child.parent, res[0]);
    });

    async function runCreateNugetDependenciesTrees(componentsToScan: ProjectDetails[], parent: DependenciesTreeNode) {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let solutions: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.NUGET);
        assert.isDefined(solutions);
        await NugetUtils.createDependenciesTrees(solutions, componentsToScan, treesManager, parent, false);
        return parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
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
