import { assert } from 'chai';
import { before } from 'mocha';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails, IIssue, ILicense } from 'jfrog-client-js';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { GoDependencyUpdate } from '../../main/dependencyUpdate/goDependencyUpdate';
import { FocusType } from '../../main/focus/abstractFocus';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { GoTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { Issue } from '../../main/types/issue';
import { License } from '../../main/types/license';
import { GoUtils } from '../../main/utils/goUtils';
import { Translators } from '../../main/utils/translators';
import { TestMemento } from './utils/testMemento.test';
import * as utils from './utils/utils.test';
import { getNodeByArtifactId } from './utils/utils.test';

/**
 * Test functionality of @class GoUtils.
 */
describe('Go Utils Tests', () => {
    let logManager: LogManager = new LogManager().activate({} as vscode.ExtensionContext);
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: new TestMemento() as vscode.Memento
    } as vscode.ExtensionContext);
    let treesManager: TreesManager = new TreesManager([], new ConnectionManager(logManager), dummyScanCacheManager, logManager);
    let projectDirs: string[] = ['dependency', 'empty'];
    let goDependencyUpdate: GoDependencyUpdate = new GoDependencyUpdate();
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
        let goMods: Collections.Set<vscode.Uri> = await GoUtils.locateGoMods(workspaceFolders, treesManager.logManager);
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
        assert.deepEqual(dependenciesPos[0], new vscode.Position(4, 0));
        assert.deepEqual(dependenciesPos[1], new vscode.Position(4, 7));

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

        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('github.com/jfrog/gofrog', '1.0.5', [], '', ''));
        let dependencyPos: vscode.Position[] = GoUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(5, 1));
        assert.deepEqual(dependencyPos[1], new vscode.Position(5, 31));

        // Test 'resources/go/empty/go.mod'
        goMod = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'go.mod'));
        textDocument = await vscode.workspace.openTextDocument(goMod);
        dependencyPos = GoUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.isEmpty(dependencyPos);
    });

    it('Update fixed version', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        await runCreateGoDependenciesTrees(componentsToScan, parent);

        // Get specific dependency node.
        let node: DependenciesTreeNode | null = getNodeByArtifactId(parent, 'github.com/jfrog/gofrog');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '1.0.5');

        // Create a new version different from the node.
        goDependencyUpdate.updateDependencyVersion(node!, '1.0.6');

        // Recalculate the dependency tree.
        parent = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        await runCreateGoDependenciesTrees(componentsToScan, parent);

        // Verify the node's version was modified.
        node = getNodeByArtifactId(parent, 'github.com/jfrog/gofrog');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '1.0.6');

        // Revert back the changes.
        goDependencyUpdate.updateDependencyVersion(node!, '1.0.5');

        // Recalculate the dependency tree.
        parent = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        await runCreateGoDependenciesTrees(componentsToScan, parent);

        node = getNodeByArtifactId(parent, 'github.com/jfrog/gofrog');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '1.0.5');
    });

    /**
     * Test GoUtils.createGoDependenciesTrees.
     */
    it('Create go Dependencies Trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: GoTreeNode[] = await runCreateGoDependenciesTrees(componentsToScan, parent);
        // Check that components to scan contains github.com/machinebox/progress:0.1.0.
        assert.equal(componentsToScan.size(), 3);
        assert.deepEqual(componentsToScan.toArray()[0], new ComponentDetails('go://github.com/jfrog/gofrog:1.0.5'));
        assert.deepEqual(componentsToScan.toArray()[1], new ComponentDetails('go://github.com/pkg/errors:0.8.0'));
        assert.deepEqual(componentsToScan.toArray()[2], new ComponentDetails('go://github.com/opencontainers/runc:1.0.0-rc2'));

        // Check labels.
        assert.deepEqual(res[0].label, 'github.com/shield/black-widow');
        assert.deepEqual(res[1].label, 'github.com/shield/falcon');

        // Check parents.
        assert.deepEqual(res[0].parent, parent);
        assert.deepEqual(res[1].parent, parent);

        // Check children.
        assert.lengthOf(res[0].children, 2);
        let child: DependenciesTreeNode = res[0].children[0];
        assert.deepEqual(child.componentId, 'github.com/jfrog/gofrog:1.0.5');
        assert.deepEqual(child.label, 'github.com/jfrog/gofrog');
        assert.deepEqual(child.description, '1.0.5');
        assert.deepEqual(child.parent, res[0]);

        // Xray general data.
        // First child.
        let actualLicense: License = child.licenses.toArray()[0];
        let expectedLicense: ILicense[] = utils.TestArtifact[0].licenses;
        assert.deepEqual(actualLicense.name, expectedLicense[0].name);
        assert.deepEqual(actualLicense.moreInfoUrl, expectedLicense[0].more_info_url);
        assert.deepEqual(actualLicense.fullName, expectedLicense[0].full_name);
        assert.deepEqual(actualLicense.components, expectedLicense[0].components);

        // Second child.
        child = res[0].children[1];
        actualLicense = child.licenses.toArray()[0];
        expectedLicense = utils.TestArtifact[1].licenses;
        assert.deepEqual(actualLicense.name, expectedLicense[0].name);
        assert.deepEqual(actualLicense.moreInfoUrl, expectedLicense[0].more_info_url);
        assert.deepEqual(actualLicense.fullName, expectedLicense[0].full_name);
        assert.deepEqual(actualLicense.components, expectedLicense[0].components);

        // Check transformation types from xray IIssue to Issue.
        let actualIssues: Issue[] = child.issues.toArray();
        let expectedIssues: IIssue[] = utils.TestArtifact[1].issues;
        // Issue created by Xray data.
        for (let i: number = 0; i < 2; i++) {
            assert.deepEqual(actualIssues[i], Translators.toIssue(expectedIssues[i]));
        }
    });

    async function runCreateGoDependenciesTrees(componentsToScan: Collections.Set<ComponentDetails>, parent: DependenciesTreeNode) {
        let dependenciesTrees: GoTreeNode[] = await GoUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, false);
        await dummyScanCacheManager.addArtifactComponents(utils.TestArtifact);
        dependenciesTrees.forEach(child => {
            treesManager.dependenciesTreeDataProvider.addXrayInfoToTree(child);
        });
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});
