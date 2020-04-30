import { assert } from 'chai';
import { before } from 'mocha';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails, IIssue, ILicense } from 'xray-client-js';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { GoUtils } from '../../main/utils/goUtils';
import * as utils from './utils/utils.test';
import { Translators } from '../../main/utils/translators';
import { Issue } from '../../main/types/issue';
import { License } from '../../main/types/license';
import { GoDependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/goDependenciesTreeNode';
import { GoTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { IComponentMetadata } from '../../main/goCenterClient/model/ComponentMetadata';
import { Severity } from '../../main/types/severity';
import { TestMemento } from './utils/testMemento.test';

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
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('github.com/jfrog/gofrog', '1.0.5', '', ''));
        let dependencyPos: vscode.Position[] = GoUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(6, 1));
        assert.deepEqual(dependencyPos[1], new vscode.Position(6, 31));

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
        let goCenterComponentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: GoTreeNode[] = await runCreateGoDependenciesTrees(componentsToScan, goCenterComponentsToScan, parent, false);
        // Check that components to scan contains github.com/machinebox/progress:0.1.0.
        assert.equal(componentsToScan.size(), 3);
        assert.deepEqual(componentsToScan.toArray()[0], new ComponentDetails('go://github.com/jfrog/gofrog:1.0.5'));
        assert.deepEqual(componentsToScan.toArray()[1], new ComponentDetails('go://github.com/pkg/errors:0.8.0'));
        assert.deepEqual(componentsToScan.toArray()[2], new ComponentDetails('go://github.com/opencontainers/runc:1.0.0-rc2'));
        assert.equal(goCenterComponentsToScan.size(), 3);
        assert.deepEqual(goCenterComponentsToScan.toArray()[0], new ComponentDetails('github.com/jfrog/gofrog:v1.0.5'));
        assert.deepEqual(goCenterComponentsToScan.toArray()[1], new ComponentDetails('github.com/pkg/errors:v0.8.0'));
        assert.deepEqual(goCenterComponentsToScan.toArray()[2], new ComponentDetails('github.com/opencontainers/runc:v1.0.0-rc2'));

        // Check labels.
        assert.deepEqual(res[0].label, 'github.com/shield/black-widow');
        assert.deepEqual(res[1].label, 'github.com/shield/falcon');

        // Check parents.
        assert.deepEqual(res[0].parent, parent);
        assert.deepEqual(res[1].parent, parent);

        // Check children.
        assert.lengthOf(res[0].children, 2);
        let child: GoDependenciesTreeNode = <GoDependenciesTreeNode>res[0].children[0];
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
        child = <GoDependenciesTreeNode>res[0].children[1];
        actualLicense = child.licenses.toArray()[0];
        expectedLicense = utils.TestArtifact[1].licenses;
        assert.deepEqual(actualLicense.name, expectedLicense[0].name);
        assert.deepEqual(actualLicense.moreInfoUrl, expectedLicense[0].more_info_url);
        assert.deepEqual(actualLicense.fullName, expectedLicense[0].full_name);
        assert.deepEqual(actualLicense.components, expectedLicense[0].components);

        // Check transformation types from xray IIssue or GoCenter ComponentMetadata to Issue.
        let actualIssues: Issue[] = child.issues.toArray();
        let expectedIssues: IIssue[] = utils.TestArtifact[1].issues;
        // Issue created by Xray data.
        for (let i: number = 0; i < 2; i++) {
            assert.deepEqual(actualIssues[i], Translators.toIssue(expectedIssues[i]));
        }
        // Issue created by GoCenter.
        assert.deepEqual(actualIssues[2].severity, Severity.Medium);
        assert.deepEqual(actualIssues[3].severity, Severity.High);

        // GoCenter  general data.
        // First child.
        child = <GoDependenciesTreeNode>res[0].children[0];
        let actualGoCenterDetails: IComponentMetadata = (<GoDependenciesTreeNode>child).componentMetadata;
        let expectedGoCenterDetails: IComponentMetadata[] = utils.TestMetadata;
        assert.deepEqual(actualGoCenterDetails, expectedGoCenterDetails[0]);

        // Second child.
        child = <GoDependenciesTreeNode>res[0].children[1];
        actualGoCenterDetails = (<GoDependenciesTreeNode>child).componentMetadata;
        expectedGoCenterDetails = utils.TestMetadata;
        assert.deepEqual(actualGoCenterDetails, expectedGoCenterDetails[1]);
    });

    async function runCreateGoDependenciesTrees(
        componentsToScan: Collections.Set<ComponentDetails>,
        goCenterComponentsToScan: Collections.Set<ComponentDetails>,
        parent: DependenciesTreeNode,
        credentialsSet: boolean
    ) {
        let dependenciesTrees: GoTreeNode[] = await GoUtils.createDependenciesTrees(
            workspaceFolders,
            componentsToScan,
            goCenterComponentsToScan,
            treesManager,
            parent,
            false
        );
        await dummyScanCacheManager.addArtifactComponents(utils.TestArtifact);
        await dummyScanCacheManager.addMetadataComponents(utils.TestMetadata);
        dependenciesTrees.forEach(child => {
            treesManager.dependenciesTreeDataProvider.addXrayInfoToTree(child);
            treesManager.dependenciesTreeDataProvider.addGoCenterInfoToTree(child, credentialsSet);
        });
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});
