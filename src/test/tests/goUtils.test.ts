import { assert } from 'chai';
import { ComponentDetails, IArtifact, IGeneral, ILicense } from 'jfrog-client-js';
import { before } from 'mocha';
import * as path from 'path';
import * as tmp from 'tmp';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { GoDependencyUpdate } from '../../main/dependencyUpdate/goDependencyUpdate';
import { FocusType } from '../../main/focus/abstractFocus';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { GoTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/goTree';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { License } from '../../main/types/license';
import { GoUtils } from '../../main/utils/goUtils';
import { TestMemento } from './utils/testMemento.test';
import { getNodeByArtifactId } from './utils/utils.test';

/**
 * Test functionality of @class GoUtils.
 */
describe('Go Utils Tests', () => {
    let logManager: LogManager = new LogManager().activate();
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: new TestMemento() as vscode.Memento,
        storagePath: tmp.dirSync().name
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

        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(
            new GeneralInfo('github.com/jfrog/jfrog-cli-core', '1.9.1', [], '', '')
        );
        let dependencyPos: vscode.Position[] = GoUtils.getDependencyPos(textDocument, dependenciesTreeNode, FocusType.Dependency);
        assert.deepEqual(dependencyPos[0], new vscode.Position(5, 1));
        assert.deepEqual(dependencyPos[1], new vscode.Position(5, 39));

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
        let node: DependenciesTreeNode | null = getNodeByArtifactId(parent, 'github.com/jfrog/jfrog-cli-core');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '1.9.0');

        // Create a new version different from the node.
        goDependencyUpdate.updateDependencyVersion(node!, '1.9.1');

        // Recalculate the dependency tree.
        parent = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        await runCreateGoDependenciesTrees(componentsToScan, parent);

        // Verify the node's version was modified.
        node = getNodeByArtifactId(parent, 'github.com/jfrog/jfrog-cli-core');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '1.9.1');

        // Revert back the changes.
        goDependencyUpdate.updateDependencyVersion(node!, '1.9.0');

        // Recalculate the dependency tree.
        parent = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        await runCreateGoDependenciesTrees(componentsToScan, parent);

        node = getNodeByArtifactId(parent, 'github.com/jfrog/jfrog-cli-core');
        assert.isNotNull(node);
        assert.equal(node?.generalInfo.version, '1.9.0');
    });

    /**
     * Test GoUtils.createGoDependenciesTrees.
     */
    it('Create go Dependencies Trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: GoTreeNode[] = await runCreateGoDependenciesTrees(componentsToScan, parent);

        assert.isAbove(componentsToScan.size(), 0);
        let gofrog: ComponentDetails | undefined;
        for (let component of componentsToScan.toArray()) {
            if (component.component_id === 'go://github.com/jfrog/gofrog:1.0.6') {
                gofrog = component;
            }
        }
        assert.isDefined(gofrog);

        // Check labels.
        assert.deepEqual(res[0].label, 'github.com/shield/black-widow');
        assert.deepEqual(res[1].label, 'github.com/shield/falcon');

        // Check parents.
        assert.deepEqual(res[0].parent, parent);
        assert.deepEqual(res[1].parent, parent);

        // Check children.
        assert.lengthOf(res[0].children, 2);
        let child: DependenciesTreeNode = res[0].children[0];
        assert.deepEqual(child.componentId, 'github.com/jfrog/jfrog-cli-core:1.9.0');
        assert.deepEqual(child.label, 'github.com/jfrog/jfrog-cli-core');
        assert.deepEqual(child.description, '1.9.0');
        assert.deepEqual(child.parent, res[0]);

        // Xray general data.
        let actualLicenseName: string = child.licenses.toArray()[0];
        let actualLicense: License | undefined = dummyScanCacheManager.getLicense(actualLicenseName)!;
        assert.isDefined(actualLicense);

        let expectedLicense: ILicense[] = xrayScanResults[0].licenses;
        assert.deepEqual(actualLicense.name, expectedLicense[0].name);
        assert.deepEqual(actualLicense.moreInfoUrl, expectedLicense[0].more_info_url);
        assert.deepEqual(actualLicense.fullName, expectedLicense[0].full_name);
    });

    async function runCreateGoDependenciesTrees(componentsToScan: Collections.Set<ComponentDetails>, parent: DependenciesTreeNode) {
        let dependenciesTrees: GoTreeNode[] = await GoUtils.createDependenciesTrees(workspaceFolders, componentsToScan, treesManager, parent, false);
        await dummyScanCacheManager.storeArtifactComponents(xrayScanResults);
        dependenciesTrees.forEach(child => {
            treesManager.dependenciesTreeDataProvider.addXrayInfoToTree(child);
        });
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});

const xrayScanResults: IArtifact[] = [
    {
        general: { component_id: 'github.com/jfrog/jfrog-cli-core:1.9.0' } as IGeneral,
        issues: [],
        licenses: [
            {
                name: 'Apache-2.0',
                full_name: 'The Apache Software License, Version 2.0',
                more_info_url: [
                    'http://raw.githubusercontent.com/aspnet/AspNetCore/2.0.0/LICENSE.txt',
                    'https://raw.githubusercontent.com/aspnet/AspNetCore/2.0.0/LICENSE.txt',
                    'http://licenses.nuget.org/Apache-2.0',
                    'https://licenses.nuget.org/Apache-2.0',
                    'http://www.apache.org/licenses/LICENSE-2.0',
                    'https://spdx.org/licenses/Apache-2.0.html',
                    'https://spdx.org/licenses/Apache-2.0',
                    'http://www.opensource.org/licenses/apache2.0.php',
                    'http://www.opensource.org/licenses/Apache-2.0'
                ],
                components: ['go://github.com/jfrog/jfrog-cli-core:1.9.1']
            } as ILicense
        ]
    }
];
