import { assert } from 'chai';
import * as fs from 'fs-extra';
import { IComponent } from 'jfrog-client-js';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { YarnDependencyUpdate } from '../../main/dependencyUpdate/yarnDependencyUpdate';
import { LogManager } from '../../main/log/logManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { BuildTreeErrorType } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { ProjectDependencyTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { PackageType } from '../../main/types/projectType';
import { YarnBerryStrategy } from '../../main/utils/yarn/yarnBerryStrategy';
import { YarnClassicStrategy } from '../../main/utils/yarn/yarnClassicStrategy';
import { ScanUtils } from '../../main/utils/scanUtils';
import { YarnUtils, YarnVersionMismatchError } from '../../main/utils/yarnUtils';

/**
 * Integration tests for Yarn Berry (v2+) projects. The Yarn version of each project is selected by the 'packageManager'
 * field in its package.json through Corepack, whose Yarn shims are installed into a temp folder that comes first in PATH.
 * The tests are skipped if Corepack is not available, unless running in CI, where a missing Corepack fails the tests.
 */
describe('Yarn Berry Utils Tests', function() {
    const logManager: LogManager = new LogManager().activate();
    const corepackDir: string = fs.mkdtempSync(path.join(os.tmpdir(), 'corepack-yarn-'));
    let getCmdEnv: sinon.SinonStub | undefined;

    before(function() {
        this.timeout(60000);
        try {
            ScanUtils.executeCmd(`corepack enable --install-directory "${corepackDir}" yarn`);
        } catch (error) {
            logManager.logMessage('Could not install the Corepack Yarn shims: ' + error, 'INFO');
            return;
        }
        const env: NodeJS.ProcessEnv = { ...ScanUtils.getCmdEnv(), COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', COREPACK_ENABLE_AUTO_PIN: '0' };
        for (const key of Object.keys(env).filter(key => key.toUpperCase() === 'PATH')) {
            env[key] = corepackDir + path.delimiter + env[key];
        }
        getCmdEnv = sinon.stub(ScanUtils, 'getCmdEnv').callsFake((extraEnv?: NodeJS.ProcessEnv) => ({ ...env, ...extraEnv }));
    });

    after(() => {
        getCmdEnv?.restore();
        fs.removeSync(corepackDir);
    });

    const berryDir: string = path.join(__dirname, '..', 'resources', 'yarn-berry');
    const classicDir: string = path.join(__dirname, '..', 'resources', 'yarn', 'project-3');
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

    function getNotBerryReason(projectDir: string): string | undefined {
        try {
            return YarnUtils.getStrategy(projectDir) instanceof YarnBerryStrategy ? undefined : 'Yarn 1 is active';
        } catch (error) {
            return String(error);
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
                this.timeout(60000);
                const reason: string | undefined = getNotBerryReason(path.join(berryDir, project.dir));
                if (!reason) {
                    return;
                }
                const message: string = project.dir + ' did not resolve to Yarn 2+ (is Corepack available?): ' + reason;
                if (process.env.CI) {
                    throw new Error(message);
                }
                logManager.logMessage('Skipping Yarn Berry tests: ' + message, 'INFO');
                this.skip();
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

    describe('Declared Yarn version', () => {
        const yarn4Dir: string = path.join(berryDir, 'yarn4');

        it('Declared version mismatch is reported as not supported', async function() {
            let mismatch: boolean = false;
            try {
                YarnUtils.getStrategy(yarn4Dir);
            } catch (error) {
                mismatch = error instanceof YarnVersionMismatchError;
            }
            if (!mismatch) {
                this.skip();
            }
            const root: any = await buildTree('yarn4');
            assert.equal(root.buildError, BuildTreeErrorType.NotSupported);
        });

        it('Yarn 1 is active in a project that declares Yarn 4', () => {
            assert.throws(
                () => YarnUtils.verifyDeclaredVersion(yarn4Dir, new semver.SemVer('1.22.22')),
                YarnVersionMismatchError,
                'packageManager": "yarn@4.18.1'
            );
            assert.throws(() => YarnUtils.verifyDeclaredVersion(yarn4Dir, new semver.SemVer('1.22.22')), 'corepack enable');
        });

        it('Declared version is active', () => {
            YarnUtils.verifyDeclaredVersion(yarn4Dir, new semver.SemVer('4.18.1'));
        });

        it('Project does not declare a version', () => {
            YarnUtils.verifyDeclaredVersion(classicDir, new semver.SemVer('1.22.22'));
            YarnUtils.verifyDeclaredVersion(classicDir, new semver.SemVer('4.18.1'));
        });

        it('Missing package.json', () => {
            YarnUtils.verifyDeclaredVersion(path.join(berryDir, 'missing'), new semver.SemVer('1.22.22'));
        });
    });

    it('Yarn classic project keeps using the classic strategy', function() {
        const strategy: any = YarnUtils.getStrategy(classicDir);
        if (strategy instanceof YarnBerryStrategy) {
            this.skip();
        }
        assert.instanceOf(strategy, YarnClassicStrategy);
    });
});
