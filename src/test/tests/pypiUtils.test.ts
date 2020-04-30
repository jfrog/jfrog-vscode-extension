import { assert } from 'chai';
import * as exec from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as tmp from 'tmp';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { PypiTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/pypiTree';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { PypiUtils } from '../../main/utils/pypiUtils';

/**
 * Test functionality of @class PypiUtils.
 */
describe('Pypi Utils Tests', () => {
    let logManager: LogManager = new LogManager().activate({} as vscode.ExtensionContext);
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: { get(key: string) {} } as vscode.Memento
    } as vscode.ExtensionContext);
    let treesManager: TreesManager = new TreesManager([], new ConnectionManager(logManager), dummyScanCacheManager, logManager);
    let projectDirs: string[] = ['requirements', 'setup', 'setupAndRequirements'];
    let workspaceFolders: vscode.WorkspaceFolder[] = [];
    let tmpDir: vscode.Uri = vscode.Uri.file(tmp.dirSync({} as tmp.DirOptions).name);

    before(() => {
        fs.copySync(path.join(__dirname, '..', 'resources', 'python'), tmpDir.fsPath);
        projectDirs.forEach(projectDir => {
            workspaceFolders.push({
                uri: vscode.Uri.file(path.join(tmpDir.fsPath, projectDir)),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder);
        });
        createVirtualEnvironment();
    });

    /**
     * Test PypiUtils.arePythonFilesExist.
     */
    it('Python files exist', async () => {
        // Assert that results contains all projects
        for (let workspaceFolder of workspaceFolders) {
            let pythonFilesExist: boolean = await PypiUtils.arePythonFilesExist(workspaceFolder, treesManager.logManager);
            assert.isTrue(pythonFilesExist, workspaceFolder.uri + ' should contain Python files');
        }
    });

    /**
     * Test PypiUtils.getDependenciesPos.
     */
    it('Get dependencies position', async () => {
        // Test 'resources/python/setup'
        let setupPy: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'setup', 'setup.py'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(setupPy);
        let dependenciesPos: vscode.Position[] = PypiUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(5, 4));

        // Test 'resources/python/setupAndRequirements'
        setupPy = vscode.Uri.file(path.join(tmpDir.fsPath, 'setupAndRequirements', 'setup.py'));
        textDocument = await vscode.workspace.openTextDocument(setupPy);
        dependenciesPos = PypiUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(14, 4));
    });

    /**
     * Test PypiUtils.getDependencyPos.
     */
    it('Get dependency position', async () => {
        // Test 'resources/python/requirements'
        let requirements: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'requirements', 'requirements.txt'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(requirements);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('newrelic', '2.0.0.1', '', ''));
        let dependencyPos: vscode.Position[] = PypiUtils.getDependencyPos(textDocument, textDocument.getText().toLowerCase(), dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(2, 0));

        // Test 'resources/python/setupAndRequirements'
        requirements = vscode.Uri.file(path.join(tmpDir.fsPath, 'setupAndRequirements', 'requirements.txt'));
        textDocument = await vscode.workspace.openTextDocument(requirements);
        dependencyPos = PypiUtils.getDependencyPos(textDocument, textDocument.getText().toLowerCase(), dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(2, 0));
    });

    /**
     * Test refreshDependencies for python projects.
     */
    it('Create Pypi Dependencies Trees', async () => {
        let localPython: string = getLocalPython();
        // Test 'resources/python/requirements'
        let dependenciesTreeNode: PypiTreeNode = new PypiTreeNode(
            workspaceFolders[0].uri.fsPath,
            new Collections.Set(),
            treesManager,
            path.join(workspaceFolders[0].uri.fsPath, localPython),
            new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', '', ''))
        );
        dependenciesTreeNode.refreshDependencies(true);
        assert.deepEqual(dependenciesTreeNode.label, 'requirements');
        assert.deepEqual(dependenciesTreeNode.children.length, 5);
        checkFireDependency(dependenciesTreeNode);

        // Test 'resources/python/setup'
        dependenciesTreeNode = new PypiTreeNode(
            workspaceFolders[1].uri.fsPath,
            new Collections.Set(),
            treesManager,
            path.join(workspaceFolders[1].uri.fsPath, localPython),
            new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', '', ''))
        );
        dependenciesTreeNode.refreshDependencies(true);
        assert.deepEqual(dependenciesTreeNode.label, 'setup');
        assert.deepEqual(dependenciesTreeNode.children.length, 3);
        let snake: PypiTreeNode | undefined = <PypiTreeNode | undefined>dependenciesTreeNode.children.filter(child => child.label === 'snake').pop();
        assert.isDefined(snake);
        assert.deepEqual(snake!.children.length, 3);
        checkFireDependency(snake!);

        // Test 'resources/python/setupAndRequirements'
        dependenciesTreeNode = new PypiTreeNode(
            workspaceFolders[2].uri.fsPath,
            new Collections.Set(),
            treesManager,
            path.join(workspaceFolders[2].uri.fsPath, localPython),
            new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', '', ''))
        );
        dependenciesTreeNode.refreshDependencies(true);
        assert.deepEqual(dependenciesTreeNode.label, 'setupAndRequirements');
        assert.deepEqual(dependenciesTreeNode.children.length, 3);
        snake = <PypiTreeNode | undefined>dependenciesTreeNode.children.filter(child => child.label === 'snake').pop();
        assert.isDefined(snake);
        assert.deepEqual(snake!.children.length, 3);
        checkFireDependency(snake!);
    });

    function checkFireDependency(dependenciesTreeNode: PypiTreeNode) {
        let fire: DependenciesTreeNode | undefined = dependenciesTreeNode.children.filter(child => child.label === 'fire').pop();
        assert.isDefined(fire);
        assert.deepEqual(fire!.generalInfo.artifactId, 'fire');
        assert.deepEqual(fire!.generalInfo.version, '0.1.3');
        assert.deepEqual(fire!.children.length, 1);
    }

    function createVirtualEnvironment() {
        let globalPython: string = getGlobalPython();
        let localPython: string = getLocalPython();
        exec.execSync(globalPython + ' -m venv .venv', { cwd: workspaceFolders[0].uri.fsPath });
        exec.execSync(localPython + ' -m pip install -r requirements.txt', { cwd: workspaceFolders[0].uri.fsPath });

        exec.execSync(globalPython + ' -m venv .venv', { cwd: workspaceFolders[1].uri.fsPath });
        exec.execSync(localPython + ' -m pip install .', { cwd: workspaceFolders[1].uri.fsPath });

        exec.execSync(globalPython + ' -m venv .venv', { cwd: workspaceFolders[2].uri.fsPath });
        exec.execSync(localPython + ' -m pip install .', { cwd: workspaceFolders[2].uri.fsPath });
    }

    function getGlobalPython(): string {
        return process.platform.startsWith('win') ? 'py -3' : 'python3';
    }

    function getLocalPython(): string {
        if (process.platform.startsWith('win')) {
            return path.join('.venv', 'Scripts', 'python.exe');
        }
        return path.join('.venv', 'bin', 'python');
    }
});
