import { assert } from 'chai';
import * as exec from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { PypiTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/pypiTree';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { PypiUtils } from '../../main/utils/pypiUtils';
import { ScanUtils } from '../../main/utils/scanUtils';
import { createScanCacheManager } from './utils/utils.test';
import { CacheManager } from '../../main/cache/cacheManager';
import { PackageType } from '../../main/types/projectType';
import { PipDepTree } from '../../main/types/pipDepTree';

/**
 * Test functionality of @class PypiUtils.
 */
describe('Pypi Utils Tests', async () => {
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
    let projectDirs: string[] = ['requirements', 'setup', 'setupAndRequirements'];
    let workspaceFolders: vscode.WorkspaceFolder[] = [];
    let tmpDir: vscode.Uri = vscode.Uri.file(ScanUtils.createTmpDir());

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

    it('Match setup.py dependencies with regex', () => {
        let dependencyToVersion: Map<string, string | undefined> = PypiUtils.getSetupPyDirectDependencies(path.join(tmpDir.fsPath, 'regex', 'setupNoDepFound.py'));
        assert.equal(dependencyToVersion.size, 0);
        dependencyToVersion = PypiUtils.getSetupPyDirectDependencies(path.join(tmpDir.fsPath, 'regex', 'setupOneDepFound.py'));
        assert.equal(dependencyToVersion.size, 1);
        assert.equal(dependencyToVersion.get('peppercorn'), '');
        dependencyToVersion = PypiUtils.getSetupPyDirectDependencies(path.join(tmpDir.fsPath, 'regex', 'setupAllKindOfDepsVariations.py'));
        assert.equal(dependencyToVersion.get('pyyaml'), '');
        assert.equal(dependencyToVersion.get('fire'), '==0.1.3');
        assert.equal(dependencyToVersion.get('regex'), '==2017.4.5');
        assert.equal(dependencyToVersion.get('matplotlib'), '>=2.2.0,<2.4.0');
        assert.equal(dependencyToVersion.get('newrelic'), '==2.0.*');
        assert.equal(dependencyToVersion.get('jupyter'), '~=1.1.1');
        assert.equal(dependencyToVersion.get('numpy'), '>=1.14.5');
        assert.equal(dependencyToVersion.size, 7);
    });

    it('Match setup.py project name with regex', () => {
        let got: string = PypiUtils.searchProjectName(path.join(tmpDir.fsPath, 'regex', 'setupNoDepFound.py'));
        assert.equal(got, 'pipgrip');
        got = PypiUtils.searchProjectName(path.join(tmpDir.fsPath, 'regex', 'setupOneDepFound.py'));
        assert.equal(got, 'sampleproject');
        got = PypiUtils.searchProjectName(path.join(tmpDir.fsPath, 'regex', 'setupAllKindOfDepsVariations.py'));
        assert.equal(got, 'example');
        got = PypiUtils.searchProjectName(path.join(tmpDir.fsPath, 'regex', 'setupWithNoName.py'));
        assert.equal(got, undefined);
    });

    it('Match requirements.txt dependencies with regex', () => {
        let dependencyToVersion: Map<string, string | undefined> = PypiUtils.getRequirementsTxtDirectDependencies(
            path.join(tmpDir.fsPath, 'regex', 'requirementsNoDepFound.txt')
        );
        assert.equal(dependencyToVersion.size, 0);

        dependencyToVersion = PypiUtils.getRequirementsTxtDirectDependencies(path.join(tmpDir.fsPath, 'regex', 'requirementsAllKindOfDepsVariations.txt'));
        assert.equal(dependencyToVersion.get('someproject1'), '');
        assert.equal(dependencyToVersion.get('some.project2'), '== 1.3');
        assert.equal(dependencyToVersion.get('someproject3'), '>= 1.2, < 2.0');
        assert.equal(dependencyToVersion.get('someproject5'), '~= 1.4.2');
        assert.equal(dependencyToVersion.get('someproject6'), '== 5.4');
        assert.equal(dependencyToVersion.get('someproject7'), '');
        assert.equal(dependencyToVersion.get('requests8'), '>= 2.8.1, == 2.8.*');
        assert.equal(dependencyToVersion.get('someproject8'), '==6.7');
        assert.equal(dependencyToVersion.get('someproject9'), '== 9.8');
        assert.equal(dependencyToVersion.get('someproject10'), '==9.0');
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
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(
            new GeneralInfo('newrelic', '2.0.0.1', [], '', PackageType.Unknown)
        );
        let dependencyPos: vscode.Range[] = PypiUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(2, 0));

        // Test 'resources/python/setupAndRequirements'
        requirements = vscode.Uri.file(path.join(tmpDir.fsPath, 'setupAndRequirements', 'requirements.txt'));
        textDocument = await vscode.workspace.openTextDocument(requirements);
        dependencyPos = PypiUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(2, 0));
    });

    /**
     * Test refreshDependencies for python projects.
     */
    it('Create Pypi Dependencies Trees', async () => {
        let localPython: string = getLocalPython();
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('', '', [], '', PackageType.Unknown));
        let tree: PipDepTree[] | undefined = PypiUtils.runPipDepTree(path.join(workspaceFolders[0].uri.fsPath, localPython), treesManager.logManager);
        if (tree === undefined) {
            assert.fail;
            return;
        }
        let workspaceDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
            [workspaceFolders[0]],
            treesManager.logManager
        );
        await PypiUtils.descriptorsToDependencyTrees(workspaceDescriptors.get(PackageType.Python) || [], tree, () => undefined, treesManager, parent);

        // Test 'resources/python/requirements'
        let node: PypiTreeNode | undefined = parent.children[0] as PypiTreeNode;
        assert.deepEqual(node?.label, 'requirements.txt');
        assert.deepEqual(node?.children.length, 3);
        checkFireDependency(node);

        // Test 'resources/python/setup'
        tree = PypiUtils.runPipDepTree(path.join(workspaceFolders[1].uri.fsPath, localPython), treesManager.logManager);
        if (tree === undefined) {
            assert.fail;
            return;
        }
        workspaceDescriptors = await ScanUtils.locatePackageDescriptors([workspaceFolders[1]], treesManager.logManager);
        await PypiUtils.descriptorsToDependencyTrees(workspaceDescriptors.get(PackageType.Python) || [], tree, () => undefined, treesManager, parent);
        node = parent.children[1] as PypiTreeNode;
        assert.deepEqual(node.label, 'setup.py');
        assert.deepEqual(node.children.length, 3);
        checkFireDependency(node);

        // Test 'resources/python/setupAndRequirements'
        parent = new DependenciesTreeNode(new GeneralInfo('', '', [], '', PackageType.Unknown));
        tree = PypiUtils.runPipDepTree(path.join(workspaceFolders[2].uri.fsPath, localPython), treesManager.logManager);
        if (tree === undefined) {
            assert.fail;
            return;
        }
        workspaceDescriptors = await ScanUtils.locatePackageDescriptors([workspaceFolders[2]], treesManager.logManager);
        await PypiUtils.descriptorsToDependencyTrees(workspaceDescriptors.get(PackageType.Python) || [], tree, () => undefined, treesManager, parent);
        node = parent.children.find(child => child.label === 'setup.py') as PypiTreeNode | undefined;
        if (!node) {
            assert.fail;
            return;
        }
        assert.deepEqual(node?.label, 'setup.py');
        assert.deepEqual(node?.children.length, 0);
        node = parent.children.find(child => child.label === 'requirements.txt') as PypiTreeNode | undefined;
        if (!node) {
            assert.fail;
            return;
        }
        assert.deepEqual(node.children.length, 3);
        checkFireDependency(node);
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
