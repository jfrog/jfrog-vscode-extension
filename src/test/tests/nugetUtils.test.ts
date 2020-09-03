import { assert } from 'chai';
import { before } from 'mocha';
import * as path from 'path';
import * as fs from 'fs';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { NugetUtils } from '../../main/utils/nugetUtils';
import { isWindows } from './utils/utils.test';

/**
 * Test functionality of @class NugetUtils.
 */
describe('Nuget Utils Tests', () => {
    let logManager: LogManager = new LogManager().activate({} as vscode.ExtensionContext);
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: { get(key: string) {} } as vscode.Memento
    } as vscode.ExtensionContext);
    let treesManager: TreesManager = new TreesManager([], new ConnectionManager(logManager), dummyScanCacheManager, logManager);
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
        let solutions: Collections.Set<vscode.Uri> = await NugetUtils.locateSolutions(workspaceFolders, treesManager.logManager);
        assert.strictEqual(solutions.size(), solutionsDirs.length);

        // Assert that results contains all solutions.
        for (let expectedSolutionDir of solutionsDirs) {
            let expectedSolution: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, expectedSolutionDir, expectedSolutionDir + '.sln'));
            assert.isTrue(solutions.contains(expectedSolution), 'Should contain ' + expectedSolution.fsPath);
        }
    });

        /**
     * Test NugetUtils.createDependenciesTrees.
     */
    it('Create NuGet Dependencies Trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: DependenciesTreeNode[] = await runCreateNugetDependenciesTrees(componentsToScan, parent);

        // Check that components to scan contains MyLogger:1.0.0
        assert.equal(componentsToScan.size(), 1);
        assert.deepEqual(componentsToScan.toArray()[0], new ComponentDetails('nuget://MyLogger:1.0.0'));

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

    async function runCreateNugetDependenciesTrees(componentsToScan: Collections.Set<ComponentDetails>, parent: DependenciesTreeNode) {
        let dependenciesTrees: DependenciesTreeNode[] = await NugetUtils.createDependenciesTrees(
            workspaceFolders,
            componentsToScan,
            treesManager,
            parent,
            false
        );
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }

    function replacePackagesPathInAssets() {
        const projects: string[] = ['api', 'core'];
        let packagesPath: string = path.join(tmpDir.fsPath, "assets", "packagesFolder");
        if (isWindows()) {
            packagesPath = packagesPath.replace(/\\/g, "\\\\");
        }
        projects.forEach(async project => {
            const fileToReplace: string = path.join(tmpDir.fsPath, "assets", project, "obj", "project.assets.json");
            let content: string = fs.readFileSync(fileToReplace, {encoding: "utf8"});
            content = content.replace(/\${PACKAGES_PATH}/g, packagesPath);
            fs.writeFileSync(fileToReplace, content, {encoding: "utf8"});
        });
    }
});
