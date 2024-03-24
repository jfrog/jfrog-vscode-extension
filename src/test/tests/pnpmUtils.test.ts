import { assert } from 'chai';
import { before } from 'mocha';
import * as path from 'path';
import * as vscode from 'vscode';
import fs from 'fs-extra';

import { LogManager } from '../../main/log/logManager';
import { PackageType } from '../../main/types/projectType';
import { ScanUtils } from '../../main/utils/scanUtils';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { PnpmUtils } from '../../main/utils/pnpmUtils';
import { GeneralInfo } from '../../main/types/generalInfo';

/**
 * Test functionality of @class PnpmUtils.
 */
describe('Pnpm Utils Tests', async () => {
    let logManager: LogManager = new LogManager().activate();
    let workspaceFolders: vscode.WorkspaceFolder[];

    let testProjectsDir: string = path.join(__dirname, '..', 'resources', 'pnpm');
    let testFolder: vscode.Uri = vscode.Uri.file(ScanUtils.createTmpDir());
    let projectDirs: string[] = ['project-1', 'project-2'];
    let packageDescriptors: Map<PackageType, vscode.Uri[]> = new Map<PackageType, vscode.Uri[]>();

    before(async () => {
        // pnpm v8 has dropped Node.js 14 support. Skip test if Node.js version is 14 or less.
        if (parseInt(process.version.slice(1).split('.')[0]) <= 14) {
            test.skip('Skip pnpm tests for Node.js v14 or less');
        }
        // Copy test projects to temp folder
        fs.copySync(testProjectsDir, testFolder.fsPath);
        workspaceFolders = [{ uri: testFolder, name: '', index: 0 } as vscode.WorkspaceFolder];
        packageDescriptors = await ScanUtils.locatePackageDescriptors(workspaceFolders, logManager);
        assert.isDefined(packageDescriptors);
    });

    after(() => {
        // Clean up temp folder
        fs.rmdirSync(testFolder.fsPath, { recursive: true });
    });

    describe('Pnpm commands', async () => {
        it('Verify pnpm installed', async () => {
            assert.isTrue(PnpmUtils.verifyPnpmInstalled());
        });
    });

    describe('Locate descriptors', async () => {
        it('Located pnpm-lock.yaml files in projects', async () => {
            let descriptors: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Pnpm);
            assert.isDefined(descriptors);
            assert.strictEqual(descriptors?.length, projectDirs.length);
            // Assert that results contains all projects
            for (let expectedProjectDir of projectDirs) {
                let expectedDescriptor: string = path.join(testFolder.fsPath, expectedProjectDir, 'pnpm-lock.yaml');
                assert.isDefined(
                    descriptors?.find(descriptor => descriptor.fsPath === expectedDescriptor),
                    'Should contain ' + expectedDescriptor
                );
            }
        });

        it('Not located Npm/Yarn projects', async () => {
            assert.isUndefined(packageDescriptors.get(PackageType.Npm));
            assert.isUndefined(packageDescriptors.get(PackageType.Yarn));
        });
    });

    describe('Build dependency tree', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));
        let sortedDescriptorTrees: DependenciesTreeNode[] = [];

        before(async () => {
            // Install projects
            projectDirs.forEach(projectDir => {
                PnpmUtils.runPnpmInstall(path.join(testFolder.fsPath, projectDir));
            });
            // Build dependency trees
            await PnpmUtils.createDependenciesTrees(packageDescriptors.get(PackageType.Pnpm), logManager, () => undefined, parent);
            sortedDescriptorTrees = parent.children.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
        });

        it('Check descriptors node general information', async () => {
            // Check number of descriptor trees
            assert.lengthOf(sortedDescriptorTrees, 2);
            // Check parents
            assert.deepEqual(sortedDescriptorTrees[0].parent, parent);
            assert.deepEqual(sortedDescriptorTrees[1].parent, parent);
        });

        it('Check descriptor node with empty dependency tree', async () => {
            let tree: DependenciesTreeNode = sortedDescriptorTrees[0];
            // Check labels
            assert.deepEqual(tree.label, 'jfrog-vscode-tests1');
            // Check direct children
            assert.lengthOf(tree.children, 0);
        });

        it('Check descriptor node with dependency tree', async () => {
            let tree: DependenciesTreeNode = sortedDescriptorTrees[1];
            // Check labels
            assert.deepEqual(tree.label, 'jfrog-vscode-tests2');
            // Check direct children
            assert.lengthOf(tree.children, 3);
            assertChild(
                tree.children.find(component => component.label === 'xml'),
                'xml',
                'xml:1.0.1',
                '1.0.1',
                ['prod'],
                tree
            );
            assertChild(
                tree.children.find(component => component.label === 'pug'),
                'pug',
                'pug:2.0.4',
                '2.0.4',
                ['prod'],
                tree
            );
            assertChild(
                tree.children.find(component => component.label === 'json'),
                'json',
                'json:9.0.6',
                '9.0.6',
                ['dev'],
                tree
            );
        });

        function assertChild(
            child: DependenciesTreeNode | undefined,
            label: string,
            componentId: string,
            description: string,
            scopes: string[],
            parent: DependenciesTreeNode
        ) {
            assert.deepEqual(child?.label, label);
            assert.deepEqual(child?.componentId, componentId);
            assert.deepEqual(child?.description, description);
            assert.deepEqual(child?.generalInfo.scopes, scopes);
            assert.deepEqual(child?.parent, parent);
        }
    });
});
