import { assert } from 'chai';
import * as fs from 'fs-extra';
import { IComponent } from 'jfrog-client-js';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { YarnDependencyUpdate } from '../../main/dependencyUpdate/yarnDependencyUpdate';
import { LogManager } from '../../main/log/logManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { ProjectDependencyTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { PackageType } from '../../main/types/projectType';
import { YarnBerryStrategy } from '../../main/utils/yarn/yarnBerryStrategy';
import { YarnClassicStrategy } from '../../main/utils/yarn/yarnClassicStrategy';
import { YarnUtils } from '../../main/utils/yarnUtils';

/**
 * Integration tests for Yarn Berry (v2+) projects. The Yarn version of each project is selected by the 'packageManager'
 * field in its package.json, which requires Corepack to be enabled ('corepack enable'). The tests are skipped otherwise.
 */
describe('Yarn Berry Utils Tests', function() {
    const logManager: LogManager = new LogManager().activate();
    const berryDir: string = path.join(__dirname, '..', 'resources', 'yarn-berry');
    const projects: { dir: string; name: string }[] = [
        { dir: 'yarn3', name: 'berry-project3' },
        { dir: 'yarn4', name: 'berry-project4' }
    ];
    const expectedDependencies: string[] = [
        '@cnakazawa/watch:1.0.4',
        'exec-sh:0.3.6',
        'function-bind:1.1.2',
        'hasown:2.0.4',
        'is-core-module:2.17.0',
        'minimist:1.2.0',
        'minimist:1.2.8',
        'path-parse:1.0.7',
        'progress:2.0.3',
        'resolve:1.22.0',
        'supports-preserve-symlinks-flag:1.0.0'
    ];

    function isBerry(projectDir: string): boolean {
        try {
            return YarnUtils.getStrategy(projectDir) instanceof YarnBerryStrategy;
        } catch (error) {
            return false;
        }
    }

    async function buildTree(projectDir: string): Promise<DependenciesTreeNode> {
        const parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));
        await YarnUtils.createDependenciesTrees([vscode.Uri.file(path.join(berryDir, projectDir, 'yarn.lock'))], logManager, () => undefined, parent);
        assert.lengthOf(parent.children, 1);
        return parent.children[0];
    }

    projects.forEach(project => {
        describe(project.dir, function() {
            before(function() {
                if (!isBerry(path.join(berryDir, project.dir))) {
                    logManager.logMessage('Skipping Yarn Berry tests: ' + project.dir + ' did not resolve to Yarn 2+ (is Corepack enabled?)', 'INFO');
                    this.skip();
                }
            });

            it('Select Berry strategy', () => {
                assert.instanceOf(YarnUtils.getStrategy(path.join(berryDir, project.dir)), YarnBerryStrategy);
            });

            it('Create dependency tree', async () => {
                const root: DependenciesTreeNode = await buildTree(project.dir);
                assert.equal(root.label, project.name);
                assert.sameMembers(
                    root.children.map(child => child.componentId),
                    expectedDependencies
                );

                const scoped: DependenciesTreeNode | undefined = root.children.find(child => child.label === '@cnakazawa/watch');
                assert.deepEqual(scoped?.generalInfo.scopes, ['cnakazawa']);
                assert.equal(scoped?.xrayDependencyId, 'npm://@cnakazawa/watch:1.0.4');
                assert.equal(scoped?.parent, root);

                const transitive: DependenciesTreeNode | undefined = root.children.find(child => child.componentId === 'minimist:1.2.8');
                assert.equal(transitive?.xrayDependencyId, 'npm://minimist:1.2.8');
            });

            it('Create impact graph', async () => {
                const root: DependenciesTreeNode = await buildTree(project.dir);
                const graph: any = (<any>root).createImpactedGraph('minimist', '1.2.8');
                assert.deepEqual(graph.root, {
                    name: project.name + ':0.0.1',
                    children: [{ name: '@cnakazawa/watch:1.0.4', children: [{ name: 'minimist:1.2.8' }] }]
                });

                const direct: any = (<any>root).createImpactedGraph('minimist', '1.2.0');
                assert.deepEqual(direct.root, { name: project.name + ':0.0.1', children: [{ name: 'minimist:1.2.0' }] });
            });

            it('Update to fixed version', function() {
                const tmpDir: string = fs.mkdtempSync(path.join(os.tmpdir(), 'yarn-berry-update-'));
                try {
                    fs.copySync(path.join(berryDir, project.dir), tmpDir);
                    const yarnLock: string = path.join(tmpDir, 'yarn.lock');
                    assert.include(fs.readFileSync(yarnLock, 'utf8'), '"minimist@npm:1.2.0":');

                    const issueToUpdate: DependencyIssuesTreeNode = new DependencyIssuesTreeNode(
                        'minimist:1.2.0',
                        { package_type: 'NPM', package_name: 'minimist', package_version: '1.2.0' } as IComponent,
                        false,
                        new ProjectDependencyTreeNode(yarnLock, PackageType.Yarn)
                    );
                    const yarnUpdate: YarnDependencyUpdate = new YarnDependencyUpdate();
                    assert.isTrue(yarnUpdate.isMatched(issueToUpdate));
                    yarnUpdate.update(issueToUpdate, '1.2.8');

                    assert.notInclude(fs.readFileSync(yarnLock, 'utf8'), 'minimist@npm:1.2.0');
                    assert.equal(JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')).dependencies.minimist, '1.2.8');
                } finally {
                    fs.removeSync(tmpDir);
                }
            });

            it('Upgrade command', () => {
                assert.equal(
                    YarnUtils.getStrategy(path.join(berryDir, project.dir)).getUpgradeCommand('minimist', '1.2.8'),
                    'yarn up minimist@1.2.8'
                );
            });
        });
    });

    it('Yarn classic project keeps using the classic strategy', function() {
        const classicDir: string = path.join(__dirname, '..', 'resources', 'yarn', 'project-3');
        let strategy: any;
        try {
            strategy = YarnUtils.getStrategy(classicDir);
        } catch (error) {
            this.skip();
        }
        if (strategy instanceof YarnBerryStrategy) {
            this.skip();
        }
        assert.instanceOf(strategy, YarnClassicStrategy);
    });
});
