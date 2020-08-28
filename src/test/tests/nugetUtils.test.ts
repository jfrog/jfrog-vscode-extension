import { assert } from 'chai';
//import * as exec from 'child_process';
import { before } from 'mocha';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
//import { ComponentDetails } from 'xray-client-js';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
//import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
//import { GeneralInfo } from '../../main/types/generalInfo';
import { NugetUtils } from '../../main/utils/nugetUtils';

/**
 * Test functionality of @class NugetUtils.
 */
describe('Nuget Utils Tests', () => {
    let logManager: LogManager = new LogManager().activate({} as vscode.ExtensionContext);
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: { get(key: string) {} } as vscode.Memento
    } as vscode.ExtensionContext);
    let treesManager: TreesManager = new TreesManager([], new ConnectionManager(logManager), dummyScanCacheManager, logManager);
    let projectDirs: string[] = ['empty', 'multi-assests'];
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
    });

    /**
     * Test NugetUtils.locateSolutions.
     */
    it('Locate solutions', async () => {
        let solutions: Collections.Set<vscode.Uri> = await NugetUtils.locateSolutions(workspaceFolders, treesManager.logManager);
        assert.strictEqual(solutions.size(), projectDirs.length);

        // Assert that results contains all projects.
        for (let expectedProjectDir of projectDirs) {
            let expectedSolution: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, expectedProjectDir, expectedProjectDir + '.sln'));
            assert.isTrue(solutions.contains(expectedSolution), 'Should contain ' + expectedSolution.fsPath);
        }
    });
});
