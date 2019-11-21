import { assert } from 'chai';
import { before } from 'mocha';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { GoUtils } from '../../main/utils/goUtils';

/**
 * Test functionality of @class GoUtils.
 */
describe('Go Utils Tests', () => {
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: { get(key: string) {} } as vscode.Memento
    } as vscode.ExtensionContext);
    let dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => {} };
    let projectDirs: string[] = ['dependency', 'empty'];
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'go'));

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
     * Test GoUtils.locateGoMods.
     */
    it('Locate go mods', async () => {
        let goMods: Collections.Set<vscode.Uri> = await GoUtils.locateGoMods(workspaceFolders, dummyProgress);
        assert.strictEqual(goMods.size(), projectDirs.length);

        // Assert that results contains all projects
        for (let expectedProjectDir of projectDirs) {
            let expectedGoMod: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, expectedProjectDir, 'go.mod'));
            assert.isTrue(goMods.contains(expectedGoMod), 'Should contain ' + expectedGoMod.fsPath);
        }
    });

    /**
     * Test GoUtils.getDependenciesPos.
     */
    it('Get dependencies position', async () => {
        // Test 'resources/go/dependency/go.mod'
        let goMod: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependency', 'go.mod'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(goMod);
        let dependenciesPos: vscode.Position[] = GoUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(2, 0));

        // Test 'resources/go/empty/go.mod'
        goMod = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'go.mod'));
        textDocument = await vscode.workspace.openTextDocument(goMod);
        dependenciesPos = GoUtils.getDependenciesPos(textDocument);
        assert.isEmpty(dependenciesPos);
    });

    /**
     * Test GoUtils.getDependencyPos.
     */
    it('Get dependency position', async () => {
        // Test 'resources/go/dependency/go.mod'
        let goMod: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependency', 'go.mod'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(goMod);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('github.com/jfrog/gofrog', '1.0.5', '', ''));
        let dependencyPos: vscode.Position[] = GoUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(2, 8));

        // Test 'resources/go/empty/go.mod'
        goMod = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'go.mod'));
        textDocument = await vscode.workspace.openTextDocument(goMod);
        dependencyPos = GoUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.isEmpty(dependencyPos);
    });

    /**
     * Test GoUtils.createGoDependenciesTrees.
     */
    it('Create go Dependencies Trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: DependenciesTreeNode[] = await runCreateGoDependenciesTrees(componentsToScan, parent);

        // Check that components to scan contains github.com/machinebox/progress:0.1.0
        assert.equal(componentsToScan.size(), 2);
        assert.deepEqual(componentsToScan.toArray()[0], new ComponentDetails('go://github.com/jfrog/gofrog:1.0.5'));

        // Check labels
        assert.deepEqual(res[0].label, 'github.com/shield/black-widow');
        assert.deepEqual(res[1].label, 'github.com/shield/falcon');

        // Check parents
        assert.deepEqual(res[0].parent, parent);
        assert.deepEqual(res[1].parent, parent);

        // Check children
        assert.lengthOf(res[0].children, 1);
        let child: DependenciesTreeNode = res[0].children[0];
        assert.deepEqual(child.componentId, 'github.com/jfrog/gofrog:1.0.5');
        assert.deepEqual(child.label, 'github.com/jfrog/gofrog');
        assert.deepEqual(child.description, '1.0.5');
        assert.deepEqual(child.parent, res[0]);
    });

    async function runCreateGoDependenciesTrees(componentsToScan: Collections.Set<ComponentDetails>, parent: DependenciesTreeNode) {
        let dependenciesTrees: DependenciesTreeNode[] = await GoUtils.createGoDependenciesTrees(
            workspaceFolders,
            dummyProgress,
            componentsToScan,
            dummyScanCacheManager,
            parent,
            false
        );
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});
