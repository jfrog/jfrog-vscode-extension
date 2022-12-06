import { assert } from 'chai';
import { before } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { NpmDependencyUpdate } from '../../main/dependencyUpdate/npmDependencyUpdate';
import { FocusType } from '../../main/focus/abstractFocus';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { ScanLogicManager } from '../../main/scanLogic/scanLogicManager';
import { NpmTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/npmTree';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { NpmUtils } from '../../main/utils/npmUtils';
import { ScanUtils } from '../../main/utils/scanUtils';
import { createScanCacheManager, getNodeByArtifactId } from './utils/utils.test';
import { PackageType } from '../../main/types/projectType';
import { ProjectDetails } from '../../main/types/projectDetails';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { CacheManager } from '../../main/cache/cacheManager';

/**
 * Test functionality of @class NpmUtils.
 */
describe('Npm Utils Tests', async () => {
    let logManager: LogManager = new LogManager().activate();
    let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();

    let treesManager: TreesManager = new TreesManager(
        [],
        new ConnectionManager(logManager),
        dummyScanCacheManager,
        {} as ScanLogicManager,
        logManager,
        {} as ScanManager,
        {} as CacheManager
    );
    let projectDirs: string[] = ['project-1', 'project-2', 'project-3'];
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
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let packageJsons: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.NPM);
        assert.isDefined(packageJsons);
        assert.strictEqual(packageJsons?.length, projectDirs.length);

        // Assert that results contains all projects
        for (let expectedProjectDir of projectDirs) {
            let expectedPackageJson: string = path.join(tmpDir.fsPath, expectedProjectDir, 'package.json');
            assert.isDefined(
                packageJsons?.find(packageJsons => packageJsons.fsPath === expectedPackageJson),
                'Should contain ' + expectedPackageJson
            );
        }
    });

    /**
     * Test NpmUtils.getDependenciesPos.
     */
    it('Get dependencies position', async () => {
        // Test 'resources/npm/dependency/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-1', 'package.json'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(packageJson);
        let dependenciesPos: vscode.Position[] = NpmUtils.getDependenciesPos(textDocument);
        assert.isEmpty(dependenciesPos);

        // Test 'resources/npm/dependencyPackageLock/package.json'
        packageJson = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-2', 'package.json'));
        textDocument = await vscode.workspace.openTextDocument(packageJson);
        dependenciesPos = NpmUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(7, 2));

        // Test 'resources/npm/empty/package.json'
        packageJson = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-3', 'package.json'));
        textDocument = await vscode.workspace.openTextDocument(packageJson);
        dependenciesPos = NpmUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(7, 2));
    });

    /**
     * Test NpmUtils.getDependencyPos.
     */
    it('Get dependency position 1', async () => {
        // Test 'resources/npm/project-1/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-1', 'package.json'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(packageJson);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('@types/node', '14.14.10', [], '', ''));
        let dependencyPos: vscode.Position[] = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.isEmpty(dependencyPos);
    });

    it('Get dependency position 2', async () => {
        // Test 'resources/npm/project-2/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-2', 'package.json'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(packageJson);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('progress', '"2.0.3', [], '', ''));
        let dependencyPos: vscode.Position[] = NpmUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(8, 4));
        assert.deepEqual(dependencyPos[1], new vscode.Position(8, 23));
    });

    it('Get dependency position 3', async () => {
        // Test 'resources/npm/project-3/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-3', 'package.json'));
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
    });

    it('Update fixed version', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: ProjectDetails = new ProjectDetails('', PackageType.UNKNOWN);
        let res: DependenciesTreeNode[] = await runCreateNpmDependenciesTrees([componentsToScan], parent);
        let dependencyProject: DependenciesTreeNode | undefined = res.find(
            node => node instanceof NpmTreeNode && node.workspaceFolder.endsWith('project-3')
        );
        assert.isNotNull(dependencyProject);

        // Get specific dependency node.
        let node: DependenciesTreeNode | null = getNodeByArtifactId(dependencyProject!, 'progress');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '2.0.3');

        // Create a new version different from the node.
        npmDependencyUpdate.updateDependencyVersion(node!, '2.0.2');

        // Recalculate the dependency tree.
        res = await runCreateNpmDependenciesTrees([componentsToScan], parent);
        dependencyProject = res.find(node => node instanceof NpmTreeNode && node.workspaceFolder.endsWith('project-3'));
        assert.isNotNull(dependencyProject);

        // Verify the node's version was modified.
        node = getNodeByArtifactId(dependencyProject!, 'progress');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '2.0.2');

        // Revert back the changes.
        npmDependencyUpdate.updateDependencyVersion(node!, '2.0.3');

        // Recalculate the dependency tree.
        res = await runCreateNpmDependenciesTrees([componentsToScan], parent);

        dependencyProject = res.find(node => node instanceof NpmTreeNode && node.workspaceFolder.endsWith('project-3'));
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
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: ProjectDetails[] = [];
        let res: DependenciesTreeNode[] = await runCreateNpmDependenciesTrees(componentsToScan, parent);

        // Check that components to scan contains progress:2.0.3
        assert.isTrue(componentsToScan.length === 3);
        let found: boolean = false;
        for (let index: number = 0; index < componentsToScan.length; index++) {
            componentsToScan[index].dependencies.forEach(el => {
                if (el.component_id === 'npm://progress:2.0.3') {
                    found = true;
                }
            });
        }
        assert.isTrue(found);

        // Check labels
        assert.deepEqual(res[0].label, 'package-name1');
        assert.deepEqual(res[1].label, 'package-name2');
        assert.deepEqual(res[2].label, 'package-name3');

        // Check parents
        assert.deepEqual(res[0].parent, parent);
        assert.deepEqual(res[1].parent, parent);
        assert.deepEqual(res[2].parent, parent);

        // Check children
        assert.lengthOf(res[1].children, 1);
        assert.lengthOf(res[2].children, 4);
        let child: DependenciesTreeNode | undefined = res[2].children.find(component => component.label === 'progress');
        assert.deepEqual(child?.label, 'progress');
        assert.deepEqual(child?.componentId, 'progress:2.0.3');
        assert.deepEqual(child?.description, '2.0.3');
        assert.deepEqual(child?.generalInfo.scopes, ['prod']);
        assert.deepEqual(child?.parent, res[2]);

        child = res[2].children.find(component => component.label === 'has-flag');
        assert.deepEqual(child?.componentId, 'has-flag:3.0.0');
        assert.deepEqual(child?.description, '3.0.0');
        assert.deepEqual(child?.generalInfo.scopes, ['dev']);
        assert.deepEqual(child?.parent, res[2]);

        child = res[2].children.find(component => component.label === '@types/node');
        assert.deepEqual(child?.componentId, '@types/node:14.14.10');
        assert.deepEqual(child?.description, '14.14.10');
        assert.deepEqual(child?.generalInfo.scopes, ['prod', 'types']);
        assert.deepEqual(child?.parent, res[2]);

        child = res[2].children.find(component => component.label === '@ungap/promise-all-settled');
        assert.deepEqual(child?.componentId, '@ungap/promise-all-settled:1.1.2');
        assert.deepEqual(child?.description, '1.1.2');
        assert.deepEqual(child?.generalInfo.scopes, ['dev', 'ungap']);
        assert.deepEqual(child?.parent, res[2]);
    });

    async function runCreateNpmDependenciesTrees(componentsToScan: ProjectDetails[], parent: DependenciesTreeNode) {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let packageJsons: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.NPM);
        assert.isDefined(packageJsons);
        await NpmUtils.createDependenciesTrees(packageJsons, componentsToScan, treesManager, parent, false);
        return parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});
