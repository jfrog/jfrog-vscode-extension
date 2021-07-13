import { assert } from 'chai';
import * as exec from 'child_process';
import { before } from 'mocha';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'jfrog-client-js';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { NpmDependencyUpdate } from '../../main/dependencyUpdate/npmDependencyUpdate';
import { FocusType } from '../../main/focus/abstractFocus';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { NpmTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/npmTree';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { NpmUtils } from '../../main/utils/npmUtils';
import { getNodeByArtifactId } from './utils/utils.test';

/**
 * Test functionality of @class NpmUtils.
 */
describe('Npm Utils Tests', () => {
    let logManager: LogManager = new LogManager().activate({} as vscode.ExtensionContext);
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: { get(key: string) {} } as vscode.Memento
    } as vscode.ExtensionContext);
    let treesManager: TreesManager = new TreesManager([], new ConnectionManager(logManager), dummyScanCacheManager, logManager);
    let projectDirs: string[] = ['dependency', 'dependencyPackageLock', 'empty'];
    let npmDependencyUpdate: NpmDependencyUpdate = new NpmDependencyUpdate();
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'npm'));

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
     * Test NpmUtils.locatePackageJsons.
     */
    it('Locate package jsons', async () => {
        let packageJsons: Collections.Set<vscode.Uri> = await NpmUtils.locatePackageJsons(workspaceFolders, treesManager.logManager);
        assert.strictEqual(packageJsons.size(), projectDirs.length);

        // Assert that results contains all projects
        for (let expectedProjectDir of projectDirs) {
            let expectedPackageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, expectedProjectDir, 'package.json'));
            assert.isTrue(packageJsons.contains(expectedPackageJson), 'Should contain ' + expectedPackageJson.fsPath);
        }
    });

    /**
     * Test NpmUtils.getDependenciesPos.
     */
    it('Get dependencies position', async () => {
        // Test 'resources/npm/dependency/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependency', 'package.json'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(packageJson);
        let dependenciesPos: vscode.Position[] = NpmUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(7, 2));

        // Test 'resources/npm/dependencyPackageLock/package.json'
        packageJson = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependencyPackageLock', 'package.json'));
        textDocument = await vscode.workspace.openTextDocument(packageJson);
        dependenciesPos = NpmUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(7, 2));

        // Test 'resources/npm/empty/package.json'
        packageJson = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'package.json'));
        textDocument = await vscode.workspace.openTextDocument(packageJson);
        dependenciesPos = NpmUtils.getDependenciesPos(textDocument);
        assert.isEmpty(dependenciesPos);
    });

    /**
     * Test NpmUtils.getDependencyPos.
     */
    it('Get dependency position', async () => {
        // Test 'resources/npm/dependency/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependency', 'package.json'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(packageJson);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('@types/node', '14.14.10', [], '', ''));
        let dependencyPos: vscode.Position[] = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(13, 4));
        assert.deepEqual(dependencyPos[1], new vscode.Position(13, 29));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('@ungap/promise-all-settled', '1.1.2', [], '', ''));
        dependencyPos = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(9, 4));
        assert.deepEqual(dependencyPos[1], new vscode.Position(9, 41));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('has-flag', '3.0.0', [], '', ''));
        dependencyPos = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(8, 4));
        assert.deepEqual(dependencyPos[1], new vscode.Position(8, 23));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('progress', '2.0.3', [], '', ''));
        dependencyPos = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(12, 4));
        assert.deepEqual(dependencyPos[1], new vscode.Position(12, 23));

        // Test 'resources/npm/dependencyPackageLock/package.json'
        packageJson = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependencyPackageLock', 'package.json'));
        textDocument = await vscode.workspace.openTextDocument(packageJson);
        dependencyPos = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(8, 4));
        assert.deepEqual(dependencyPos[1], new vscode.Position(8, 23));

        // Test 'resources/npm/empty/package.json'
        packageJson = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'package.json'));
        textDocument = await vscode.workspace.openTextDocument(packageJson);
        dependencyPos = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.isEmpty(dependencyPos);
    });

    /**
     * Test NpmUtils.createNpmDependenciesTrees for not installed npm projects.
     */
    it('Create npm Dependencies Trees before installation', async () => {
        let res: DependenciesTreeNode[] = await runCreateNpmDependenciesTrees(
            new Collections.Set(),
            new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''))
        );
        // Check labels
        assert.deepEqual(res[0].label, 'package-name1');
        assert.deepEqual(res[1].label, 'package-name2 [Not installed]');
        assert.deepEqual(res[2].label, 'package-name3 [Not installed]');

        // Check children
        assert.deepEqual(res[0].description, '0.0.1');
        assert.deepEqual(res[1].description, '0.0.1');
        assert.deepEqual(res[2].description, '0.0.1');
    });

    it('Update fixed version', async () => {
        installAllProjects();
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: DependenciesTreeNode[] = await runCreateNpmDependenciesTrees(componentsToScan, parent);
        let dependencyProject: DependenciesTreeNode | undefined = res.find(
            node => node instanceof NpmTreeNode && node.workspaceFolder.endsWith('dependency')
        );
        assert.isNotNull(dependencyProject);

        // Get specific dependency node.
        let node: DependenciesTreeNode | null = getNodeByArtifactId(dependencyProject!, 'progress');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '2.0.3');

        // Create a new version different from the node.
        npmDependencyUpdate.updateDependencyVersion(node!, '2.0.2');

        // Recalculate the dependency tree.
        res = await runCreateNpmDependenciesTrees(componentsToScan, parent);
        dependencyProject = res.find(node => node instanceof NpmTreeNode && node.workspaceFolder.endsWith('dependency'));
        assert.isNotNull(dependencyProject);

        // Verify the node's version was modified.
        node = getNodeByArtifactId(dependencyProject!, 'progress');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '2.0.2');

        // Revert back the changes.
        npmDependencyUpdate.updateDependencyVersion(node!, '2.0.3');

        // Recalculate the dependency tree.
        res = await runCreateNpmDependenciesTrees(componentsToScan, parent);

        dependencyProject = res.find(node => node instanceof NpmTreeNode && node.workspaceFolder.endsWith('dependency'));
        assert.isNotNull(dependencyProject);
        // Verify the node's version was modified.
        node = getNodeByArtifactId(dependencyProject!, 'progress');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '2.0.3');
    });

    /**
     * Test NpmUtils.createNpmDependenciesTrees.
     */
    it('Create npm Dependencies Trees', async () => {
        installAllProjects();
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: DependenciesTreeNode[] = await runCreateNpmDependenciesTrees(componentsToScan, parent);

        // Check that components to scan contains progress:2.0.3
        assert.isTrue(componentsToScan.size() === 4);
        let component: ComponentDetails | undefined = componentsToScan.toArray().find(component => component.component_id === 'npm://progress:2.0.3');
        assert.deepEqual(component, new ComponentDetails('npm://progress:2.0.3'));

        // Check labels
        assert.deepEqual(res[0].label, 'package-name1');
        assert.deepEqual(res[1].label, 'package-name2');
        assert.deepEqual(res[2].label, 'package-name3');

        // Check parents
        assert.deepEqual(res[0].parent, parent);
        assert.deepEqual(res[1].parent, parent);
        assert.deepEqual(res[2].parent, parent);

        // Check children
        assert.lengthOf(res[1].children, 4);
        assert.lengthOf(res[2].children, 1);
        let child: DependenciesTreeNode | undefined = res[1].children.find(component => component.label === 'progress');
        assert.deepEqual(child?.label, res[2].children[0].label);
        assert.deepEqual(child?.componentId, 'progress:2.0.3');
        assert.deepEqual(child?.description, '2.0.3');
        assert.deepEqual(child?.generalInfo.scopes, ['production']);
        assert.deepEqual(child?.parent, res[1]);

        child = res[1].children.find(component => component.label === 'has-flag');
        assert.deepEqual(child?.componentId, 'has-flag:3.0.0');
        assert.deepEqual(child?.description, '3.0.0');
        assert.deepEqual(child?.generalInfo.scopes, ['development']);
        assert.deepEqual(child?.parent, res[1]);

        child = res[1].children.find(component => component.label === '@types/node');
        assert.deepEqual(child?.componentId, '@types/node:14.14.10');
        assert.deepEqual(child?.description, '14.14.10');
        assert.deepEqual(child?.generalInfo.scopes, ['production', 'types']);
        assert.deepEqual(child?.parent, res[1]);

        child = res[1].children.find(component => component.label === '@ungap/promise-all-settled');
        assert.deepEqual(child?.componentId, '@ungap/promise-all-settled:1.1.2');
        assert.deepEqual(child?.description, '1.1.2');
        assert.deepEqual(child?.generalInfo.scopes, ['development', 'ungap']);
        assert.deepEqual(child?.parent, res[1]);
    });

    async function runCreateNpmDependenciesTrees(componentsToScan: Collections.Set<ComponentDetails>, parent: DependenciesTreeNode) {
        let dependenciesTrees: DependenciesTreeNode[] = await NpmUtils.createDependenciesTrees(
            workspaceFolders,
            componentsToScan,
            treesManager,
            parent,
            false
        );
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }

    function installAllProjects() {
        for (let expectedProjectDir of projectDirs) {
            exec.execSync('npm i', { cwd: path.join(tmpDir.fsPath, expectedProjectDir) });
        }
    }
});
