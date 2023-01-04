import { assert } from 'chai';
import { ComponentDetails, IArtifact, IGeneral, ILicense } from 'jfrog-client-js';
import { before } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GeneralInfo } from '../../main/types/generalInfo';
import { GoUtils } from '../../main/utils/goUtils';
import { ScanUtils } from '../../main/utils/scanUtils';
import { createScanCacheManager, getNodeByArtifactId } from './utils/utils.test';
import { PackageType } from '../../main/types/projectType';
import { ProjectDetails } from '../../main/types/projectDetails';
import { ProjectComponents } from '../../main/types/projectComponents';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { CacheManager } from '../../main/cache/cacheManager';
import { FocusType } from '../../main/constants/contextKeys';

/**
 * Test functionality of @class GoUtils.
 */
describe('Go Utils Tests', async () => {
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

    let tmpDir: string = path.join(__dirname, '..', 'resources', 'go');
    let commonProjDir: vscode.Uri = vscode.Uri.file(path.join(tmpDir, 'common'));
    let commonWorkspaceFolders: vscode.WorkspaceFolder[];

    before(() => {
        commonWorkspaceFolders = [
            {
                uri: commonProjDir,
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
    });

    /**
     * Test GoUtils.locateGoMods.
     */
    it('Locate go mods', async () => {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
            commonWorkspaceFolders,
            treesManager.logManager
        );
        let projectDirs: string[] = ['dependency', 'empty'];
        let goMods: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Go);
        assert.isDefined(goMods);
        assert.strictEqual(goMods?.length, projectDirs.length);

        // Assert that results contains all projects
        for (let expectedProjectDir of projectDirs) {
            let expectedGoMod: string = path.join(commonProjDir.fsPath, expectedProjectDir, 'go.mod');
            assert.isDefined(
                goMods?.find(goMod => goMod.fsPath === expectedGoMod),
                'Should contain ' + expectedGoMod
            );
        }
    });

    /**
     * Test GoUtils.getDependenciesPos.
     */
    it('Get dependencies position', async () => {
        // Test 'resources/go/dependency/go.mod'
        let goMod: vscode.Uri = vscode.Uri.file(path.join(commonProjDir.fsPath, 'dependency', 'go.mod'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(goMod);
        let dependenciesPos: vscode.Position[] = GoUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(4, 0));
        assert.deepEqual(dependenciesPos[1], new vscode.Position(4, 7));

        // Test 'resources/go/empty/go.mod'
        goMod = vscode.Uri.file(path.join(commonProjDir.fsPath, 'empty', 'go.mod'));
        textDocument = await vscode.workspace.openTextDocument(goMod);
        dependenciesPos = GoUtils.getDependenciesPos(textDocument);
        assert.isEmpty(dependenciesPos);
    });

    /**
     * Test GoUtils.getDependencyPos.
     */
    it('Get dependency position', async () => {
        // Test 'resources/go/dependency/go.mod'
        let goMod: vscode.Uri = vscode.Uri.file(path.join(commonProjDir.fsPath, 'dependency', 'go.mod'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(goMod);

        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(
            new GeneralInfo('github.com/jfrog/jfrog-cli-core', '1.9.1', [], '', '')
        );
        let dependencyPos: vscode.Position[] = GoUtils.getDependencyPosition(
            textDocument,
            dependenciesTreeNode.dependencyId ?? '',
            FocusType.Dependency
        );
        assert.deepEqual(dependencyPos[0], new vscode.Position(5, 1));
        assert.deepEqual(dependencyPos[1], new vscode.Position(5, 39));

        // Test 'resources/go/empty/go.mod'
        goMod = vscode.Uri.file(path.join(commonProjDir.fsPath, 'empty', 'go.mod'));
        textDocument = await vscode.workspace.openTextDocument(goMod);
        dependencyPos = GoUtils.getDependencyPosition(textDocument, dependenciesTreeNode.dependencyId ?? '', FocusType.Dependency);
        assert.isEmpty(dependencyPos);
    });

    /**
     * Test GoUtils.createGoDependenciesTrees.
     */
    it('Create go Dependencies Trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
        let componentsToScan: ProjectDetails[] = [];
        await runCreateGoDependenciesTrees(commonWorkspaceFolders, componentsToScan, parent);

        assert.isAbove(componentsToScan.length, 0);
        let gofrog: ComponentDetails | undefined;
        for (let index: number = 0; index < componentsToScan.length; index++) {
            for (let component of componentsToScan[index].toArray()) {
                if (component.component_id === 'go://github.com/jfrog/gofrog:1.0.6') {
                    gofrog = component;
                }
            }
        }
        assert.isDefined(gofrog);

        // Check labels.
        assert.deepEqual(parent.children[0].label, 'github.com/shield/black-widow');
        assert.deepEqual(parent.children[1].label, 'github.com/shield/falcon');

        // Check parents.
        assert.deepEqual(parent.children[0].parent, parent);
        assert.deepEqual(parent.children[1].parent, parent);

        // Check children.
        assert.lengthOf(parent.children[0].children, 2);
        let child: DependenciesTreeNode = parent.children[0].children[0];
        assert.deepEqual(child.componentId, 'github.com/jfrog/jfrog-cli-core:1.9.0');
        assert.deepEqual(child.label, 'github.com/jfrog/jfrog-cli-core');
        assert.deepEqual(child.description, '1.9.0');
        assert.deepEqual(child.parent, parent.children[0]);
    });

    /**
     * The project is with dependencies, but without go.sum
     */
    it('Project 1 - Create go project with dependencies', async () => {
        let projectName: string = 'project1';
        let expectedChildren: Map<string, number> = new Map();
        expectedChildren.set('github.com/jfrog/jfrog-cli-core:1.9.0', 11);
        expectedChildren.set('github.com/jfrog/jfrog-client-go:0.26.1', 9);
        createGoDependencyTreeAndValidate(projectName, expectedChildren);
    });

    /**
     * The project is with dependencies and go.sum, but with checksum mismatch on github.com/dsnet/compress
     */
    it('Project 2 - Create go project with dependencies', async () => {
        let projectName: string = 'project2';
        let expectedChildren: Map<string, number> = new Map();
        expectedChildren.set('github.com/jfrog/gocmd:0.1.12', 2);
        createGoDependencyTreeAndValidate(projectName, expectedChildren);
    });

    /**
     * The project is with dependencies and go.sum, but contains a relative path in go.mod
     * The submodule is a subdirectory of the project directory.
     */
    it('Project 3 - Create go project with dependencies', async () => {
        let projectName: string = 'project3';
        let expectedChildren: Map<string, number> = new Map();
        expectedChildren.set('github.com/test/subproject:0.0.0-00010101000000-000000000000', 1);
        createGoDependencyTreeAndValidate(projectName, expectedChildren);
    });

    /**
     * The project is with dependencies and go.sum, but contains a relative path in go.mod.
     * The submodule is a sibling of the project directory.
     */
    it('Project 4 - Create go project with dependencies', async () => {
        let projectName: string = 'project4';
        let expectedChildren: Map<string, number> = new Map();
        expectedChildren.set('github.com/test/subproject:0.0.0-00010101000000-000000000000', 1);
        createGoDependencyTreeAndValidate(projectName, expectedChildren);
    });

    async function runCreateGoDependenciesTrees(
        workspaceFolders: vscode.WorkspaceFolder[],
        componentsToScan: ProjectDetails[],
        parent: DependenciesTreeNode
    ) {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let goMods: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Go);
        await GoUtils.createDependenciesTrees(goMods, componentsToScan, treesManager, parent, () => {
            assert;
        });
        await dummyScanCacheManager.storeArtifacts(xrayScanResults, { componentIdToCve: new Map() } as ProjectComponents);
        // parent.children.forEach(child => {
        //     treesManager.dependenciesTreeDataProvider.addXrayInfoToTree(child);
        // });
        return parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }

    async function createGoDependencyTreeAndValidate(projectName: string, expectedChildren: Map<string, number>) {
        try {
            let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', ''));
            let componentsToScan: ProjectDetails[] = [];
            await runCreateGoDependenciesTrees(getWorkspaceFolders(projectName), componentsToScan, parent);

            validateDependencyTreeResults(projectName, expectedChildren, parent);
        } catch (error) {
            assert.fail('creating go tree failed with error: ' + error);
        }
    }

    function validateDependencyTreeResults(projectName: string, expectedChildren: Map<string, number>, node: DependenciesTreeNode) {
        let parent: DependenciesTreeNode | null = getNodeByArtifactId(node, projectName);
        if (!parent) {
            assert.isNotNull(node);
            return;
        }

        let children: DependenciesTreeNode[] = parent.children;
        assert.lengthOf(children, expectedChildren.size);
        children.forEach(child => {
            assert.isTrue(expectedChildren.has(child.componentId));
            assert.equal(child.children.length, expectedChildren.get(child.componentId));
            assert.isTrue(child.generalInfo.scopes.includes('None'));
        });
    }

    function getWorkspaceFolders(projectName: string): vscode.WorkspaceFolder[] {
        return [
            {
                uri: vscode.Uri.file(path.join(tmpDir, projectName)),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
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
