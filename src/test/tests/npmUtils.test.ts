import { assert } from 'chai';
import { before } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { NpmUtils } from '../../main/utils/npmUtils';
import { ScanUtils } from '../../main/utils/scanUtils';
import { createScanCacheManager } from './utils/utils.test';
import { PackageType } from '../../main/types/projectType';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { CacheManager } from '../../main/cache/cacheManager';
import { FocusType } from '../../main/constants/contextKeys';
import { NpmCmd } from '../../main/utils/cmds/npm';
import * as fs from 'fs';

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
        {} as ScanManager,
        {} as CacheManager,
        logManager
    );
    let projectDirs: string[] = ['project-1', 'project-2', 'project-3'];
    // let npmDependencyUpdate: NpmDependencyUpdate = new NpmDependencyUpdate();
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'npm', 'utilsTest'));

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
        let packageJsons: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Npm);
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
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(
            new GeneralInfo('@types/node', '14.14.10', [], '', PackageType.Unknown)
        );
        let dependencyPos: vscode.Range[] = NpmUtils.getDependencyPosition(
            textDocument,
            dependenciesTreeNode.generalInfo.artifactId,
            FocusType.Dependency
        );
        assert.isEmpty(dependencyPos);
    });

    it('Get dependency position 2', async () => {
        // Test 'resources/npm/project-2/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-2', 'package.json'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(packageJson);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('progress', '"2.0.3', [], '', PackageType.Unknown));
        let dependencyPos: vscode.Range[] = NpmUtils.getDependencyPosition(
            textDocument,
            dependenciesTreeNode.generalInfo.artifactId,
            FocusType.Dependency
        );
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(8, 4));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(8, 23));
    });

    it('Get dependency position 3', async () => {
        // Test 'resources/npm/project-3/package.json'
        let packageJson: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-3', 'package.json'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(packageJson);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(
            new GeneralInfo('@types/node', '14.14.10', [], '', PackageType.Unknown)
        );
        let dependencyPos: vscode.Range[] = NpmUtils.getDependencyPosition(
            textDocument,
            dependenciesTreeNode.generalInfo.artifactId,
            FocusType.Dependency
        );
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(13, 4));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(13, 29));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('@ungap/promise-all-settled', '1.1.2', [], '', PackageType.Unknown));
        dependencyPos = NpmUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(9, 4));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(9, 41));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('has-flag', '3.0.0', [], '', PackageType.Unknown));
        dependencyPos = NpmUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(8, 4));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(8, 23));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('progress', '2.0.3', [], '', PackageType.Unknown));
        dependencyPos = NpmUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(12, 4));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(12, 23));
    });

    describe('Dependencies Trees', async () => {
        before(() => {
            setUp();
        });

        after(() => {
            tearDown();
        });

        it('Check the tree of the npm dependency tree build', async () => {
            let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));
            let res: DependenciesTreeNode[] = await runCreateNpmDependenciesTrees(parent);

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
            assert.deepEqual(child?.parent, res[2]);

            child = res[2].children.find(component => component.label === 'has-flag');
            assert.deepEqual(child?.componentId, 'has-flag:3.0.0');
            assert.deepEqual(child?.description, '3.0.0');
            assert.deepEqual(child?.parent, res[2]);

            child = res[2].children.find(component => component.label === '@types/node');
            assert.deepEqual(child?.componentId, '@types/node:14.14.10');
            assert.deepEqual(child?.description, '14.14.10');
            assert.deepEqual(child?.generalInfo.scopes, ['types']);
            assert.deepEqual(child?.parent, res[2]);

            child = res[2].children.find(component => component.label === '@ungap/promise-all-settled');
            assert.deepEqual(child?.componentId, '@ungap/promise-all-settled:1.1.2');
            assert.deepEqual(child?.description, '1.1.2');
            assert.deepEqual(child?.generalInfo.scopes, ['ungap']);
            assert.deepEqual(child?.parent, res[2]);
        });

        function setUp() {
            if (NpmCmd.isLegacyNpmVersion()) {
                // npm v6 does not have the flag '--package-lock-only' so we have to install each test project before building the dependencies tree
                projectDirs.forEach(projectDir => {
                    NpmCmd.runNpmCi(path.join(tmpDir.fsPath, projectDir));
                });
            }
        }
        function tearDown() {
            if (NpmCmd.isLegacyNpmVersion()) {
                projectDirs.forEach(projectDir => {
                    fs.rmdirSync(path.join(tmpDir.fsPath, projectDir), { recursive: true });
                });
            }
        }
    });

    describe('Partial Dependencies Trees', async () => {
        it('Build partial build in case of "npm ls" error', async () => {
            let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'npm', 'utilsTest', 'partialTree'));
            NpmCmd.runNpmCi(tmpDir.fsPath, ['--legacy-peer-deps']);

            let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));
            let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
                (workspaceFolders = [
                    {
                        uri: tmpDir,
                        name: '',
                        index: 0
                    } as vscode.WorkspaceFolder
                ]),
                treesManager.logManager
            );
            let packageJsons: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Npm);

            await NpmUtils.createDependenciesTrees(packageJsons, treesManager.logManager, () => undefined, parent);
            assert.isTrue(parent.children[0].children.length > 0);
        });
    });

    async function runCreateNpmDependenciesTrees(parent: DependenciesTreeNode) {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let packageJsons: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Npm);
        assert.isDefined(packageJsons);
        await NpmUtils.createDependenciesTrees(packageJsons, treesManager.logManager, () => undefined, parent);
        return parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});
