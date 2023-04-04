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
import { PackageType } from '../../main/types/projectType';
import { ScanUtils } from '../../main/utils/scanUtils';
import { YarnUtils } from '../../main/utils/yarnUtils';
import { createScanCacheManager } from '../utils/utils.test';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { CacheManager } from '../../main/cache/cacheManager';

/**
 * Test functionality of @class YarnUtils.
 */
describe('Yarn Utils Tests', async () => {
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
    // let yarnDependencyUpdate: YarnDependencyUpdate = new YarnDependencyUpdate();
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'yarn'));

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
     * Test locatePackageDescriptors for yarn.
     */
    it('Locate yarn locks', async () => {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let yarnLocks: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Yarn);
        assert.isDefined(yarnLocks);
        assert.strictEqual(yarnLocks?.length, projectDirs.length);

        // Assert that results contains all projects
        for (let expectedProjectDir of projectDirs) {
            let expectedYarnLocks: string = path.join(tmpDir.fsPath, expectedProjectDir, 'yarn.lock');
            assert.isDefined(
                yarnLocks?.find(yarnLock => yarnLock.fsPath === expectedYarnLocks),
                'Should contain ' + expectedYarnLocks
            );
        }
    });

    /**
     * Test YarnUtils.getDependenciesPos.
     */
    it('Get dependencies position', async () => {
        // Test 'resources/yarn/project-1/yarn.lock'
        let yarnLocks: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-1', 'yarn.lock'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(yarnLocks);
        let dependenciesPos: vscode.Position[] = YarnUtils.getDependenciesPos(textDocument);
        assert.isEmpty(dependenciesPos);

        // Test 'resources/yarn/project-2/yarn.lock'
        yarnLocks = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-2', 'yarn.lock'));
        textDocument = await vscode.workspace.openTextDocument(yarnLocks);
        dependenciesPos = YarnUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(4, 0));

        // Test 'resources/yarn/project-3/yarn.lock'
        yarnLocks = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-3', 'yarn.lock'));
        textDocument = await vscode.workspace.openTextDocument(yarnLocks);
        dependenciesPos = YarnUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(4, 0));
    });

    /**
     * Test YarnUtils.getDependencyPos.
     */
    it('Get dependency position 1', async () => {
        // Test 'resources/yarn/project-1/yarn.lock'
        let yarnLock: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-1', 'yarn.lock'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(yarnLock);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(
            new GeneralInfo('@types/node', '14.14.10', [], '', PackageType.Unknown)
        );
        let dependencyPos: vscode.Range[] = YarnUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.isEmpty(dependencyPos);
    });

    it('Get dependency position 2', async () => {
        // Test 'resources/yarn/project-2/yarn.lock'
        let yarnLock: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-2', 'yarn.lock'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(yarnLock);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('progress', '"2.0.3', [], '', PackageType.Unknown));
        let dependencyPos: vscode.Range[] = YarnUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(4, 0));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(4, 14));
    });

    it('Get dependency position 3', async () => {
        // Test 'resources/yarn/project-3/yarn.lock'
        let yarnLock: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'project-3', 'yarn.lock'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(yarnLock);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(
            new GeneralInfo('@types/node', '14.14.10', [], '', PackageType.Unknown)
        );
        let dependencyPos: vscode.Range[] = YarnUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(4, 1));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(4, 21));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('@ungap/promise-all-settled', '1.1.2', [], '', PackageType.Unknown));
        dependencyPos = YarnUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(9, 1));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(9, 33));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('has-flag', '3.0.0', [], '', PackageType.Unknown));
        dependencyPos = YarnUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(14, 0));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(14, 14));

        dependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('progress', '2.0.3', [], '', PackageType.Unknown));
        dependencyPos = YarnUtils.getDependencyPosition(textDocument, dependenciesTreeNode.generalInfo.artifactId);
        assert.deepEqual(dependencyPos[0].start, new vscode.Position(19, 0));
        assert.deepEqual(dependencyPos[0].end, new vscode.Position(19, 14));
    });

    /**
     * Test YarnUtils.createYarnDependencyTrees.
     */
    it('Create yarn dependency trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));
        let res: DependenciesTreeNode[] = await runCreateYarnDependencyTrees(parent);

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
        assert.deepEqual(child?.generalInfo.scopes, []);
        assert.deepEqual(child?.parent, res[2]);

        child = res[2].children.find(component => component.label === 'has-flag');
        assert.deepEqual(child?.componentId, 'has-flag:3.0.0');
        assert.deepEqual(child?.description, '3.0.0');
        assert.deepEqual(child?.generalInfo.scopes, []);
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

    async function runCreateYarnDependencyTrees(parent: DependenciesTreeNode) {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let yarnLocks: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Yarn);
        assert.isDefined(yarnLocks);
        await YarnUtils.createDependenciesTrees(yarnLocks, treesManager.logManager, () => undefined, parent);
        return parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});
