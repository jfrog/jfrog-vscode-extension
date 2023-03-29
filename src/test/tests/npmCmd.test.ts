import { assert } from 'chai';
import * as path from 'path';
import * as fs from 'fs';
import { Flag, NpmCmd } from '../../main/utils/cmds/npm';
import { unsetSkipDevDependencies, setSkipDevDependencies } from './filterNpmDependencies.test';

const outsideProjectRoot: string = path.join(__dirname, '..', 'resources', 'npm');
const projectRoot: string = path.join(outsideProjectRoot, 'filterDevDepsTest');
describe('npm cmds', async () => {
    it('Check npm version', async () => {
        assert.isNotEmpty(NpmCmd.runNpmVersion());
    });

    it('Check skip dev dependencies flag is not return when excludeDevDependencies is false', async () => {
        assert.equal(NpmCmdTestWrapper.getSkipDevDependenciesFlag(), '');
    });

    describe('version 6 or below', async () => {
        before(async function() {
            if (!NpmCmd.isLegacyNpmVersion()) {
                this.skip();
            }
            await setSkipDevDependencies();
        });

        after(async () => {
            await unsetSkipDevDependencies();
        });

        it('Check skip dev dependencies flag', async () => {
            assert.equal(NpmCmdTestWrapper.getSkipDevDependenciesFlag(), Flag.LegacySkipDevDependencies);
        });

        describe('node_modules exists', async () => {
            before(() => {
                NpmCmd.runNpmCi(projectRoot);
            });

            after(() => {
                fs.rmdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
            });

            it('Check node_module exist', async () => {
                assert.isTrue(NpmCmdTestWrapper.isNodeModulesExists(projectRoot));
            });

            it('Check package-lock-only flag is not return', async () => {
                assert.isEmpty(NpmCmdTestWrapper.getPackageLockOnlyFlag(projectRoot));
            });
        });
        describe('node_modules does not exists', async () => {
            it('Check node_module does not exist', async () => {
                assert.isFalse(NpmCmdTestWrapper.isNodeModulesExists(outsideProjectRoot));
            });

            it('Check package-lock-only flag is not return', async () => {
                assert.isEmpty(NpmCmdTestWrapper.getPackageLockOnlyFlag(projectRoot));
            });
        });
    });

    describe('version 7 or above', async () => {
        before(async function() {
            if (NpmCmd.isLegacyNpmVersion()) {
                this.skip();
            }
            await setSkipDevDependencies();
        });

        after(async () => {
            await unsetSkipDevDependencies();
        });

        it('Check skip dev dependencies flag', async () => {
            assert.equal(NpmCmdTestWrapper.getSkipDevDependenciesFlag(), Flag.SkipDevDependencies);
        });

        describe('node_modules exists', async () => {
            before(() => {
                NpmCmd.runNpmCi(projectRoot);
            });

            after(() => {
                fs.rmdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
            });

            it('Check node_module exist', async () => {
                assert.isTrue(NpmCmdTestWrapper.isNodeModulesExists(projectRoot));
            });

            it('Check package-lock-only flag is not return', async () => {
                assert.isEmpty(NpmCmdTestWrapper.getPackageLockOnlyFlag(projectRoot));
            });
        });

        describe('node_modules does not exists', async () => {
            it('Check node_module does not exist', async () => {
                assert.isFalse(NpmCmdTestWrapper.isNodeModulesExists(outsideProjectRoot));
            });

            it('Check package-lock-only flag is not return', async () => {
                assert.equal(NpmCmdTestWrapper.getPackageLockOnlyFlag(outsideProjectRoot), Flag.PackageLockOnly);
            });
        });
    });
});

class NpmCmdTestWrapper extends NpmCmd {
    public static isNodeModulesExists(workspaceFolder: string) {
        return NpmCmd.isNodeModulesExists(workspaceFolder);
    }

    public static isLegacyNpmVersion() {
        return NpmCmd.isLegacyNpmVersion();
    }

    public static getPackageLockOnlyFlag(workspaceFolder: string) {
        return NpmCmd.getPackageLockOnlyFlag(workspaceFolder);
    }

    public static getSkipDevDependenciesFlag() {
        return NpmCmd.getSkipDevDependenciesFlag();
    }
}
