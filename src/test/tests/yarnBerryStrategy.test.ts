import { assert } from 'chai';
import * as sinon from 'sinon';
import { ScanUtils } from '../../main/utils/scanUtils';
import { parseBerryLocator } from '../../main/utils/yarn/yarnBerryLocator';
import { YarnBerryStrategy } from '../../main/utils/yarn/yarnBerryStrategy';
import { YarnClassicStrategy } from '../../main/utils/yarn/yarnClassicStrategy';

describe('Yarn Berry strategy', () => {
    it('Parse npm locators', () => {
        assert.deepEqual(parseBerryLocator('minimist@npm:1.2.8'), { name: 'minimist', version: '1.2.8' });
        assert.deepEqual(parseBerryLocator('@babel/core@npm:7.29.7'), { name: '@babel/core', version: '7.29.7' });
        assert.deepEqual(parseBerryLocator('pkg@npm:1.0.0-beta.1'), { name: 'pkg', version: '1.0.0-beta.1' });
    });

    it('Parse npm locator with bindings', () => {
        assert.deepEqual(
            parseBerryLocator('@scope/pkg@npm:1.2.3::__archiveUrl=https%3A%2F%2Facme.jfrog.io%2Fartifactory%2Fapi%2Fnpm%2Fnpm%2Fpkg-1.2.3.tgz'),
            { name: '@scope/pkg', version: '1.2.3' }
        );
    });

    it('Parse virtual locator', () => {
        assert.deepEqual(parseBerryLocator('jest-config@virtual:bf7a8695861ccc96c7503a95daba2b038c9b3eca#npm:26.6.3'), {
            name: 'jest-config',
            version: '26.6.3'
        });
    });

    it('Parse patch locator', () => {
        assert.deepEqual(parseBerryLocator('resolve@patch:resolve@npm%3A1.22.0#optional!builtin<compat/resolve>::version=1.22.0&hash=9bd1a5'), {
            name: 'resolve',
            version: '1.22.0'
        });
    });

    it('Ignore non npm locators', () => {
        assert.isUndefined(parseBerryLocator('tiny@workspace:.'));
        assert.isUndefined(parseBerryLocator('pkg@portal:../pkg::locator=tiny%40workspace%3A.'));
        assert.isUndefined(parseBerryLocator('pkg@https://github.com/org/pkg.git#commit=abc'));
    });

    it('Parse yarn info output', () => {
        const output: string = [
            '{"value":"@cnakazawa/watch@npm:1.0.4","children":{"Version":"1.0.4","Dependencies":[{"descriptor":"minimist@npm:^1.2.0","locator":"minimist@npm:1.2.8"}]}}',
            '{"value":"minimist@npm:1.2.0","children":{"Version":"1.2.0"}}',
            '{"value":"minimist@npm:1.2.8","children":{"Version":"1.2.8"}}',
            '{"value":"resolve@npm:1.22.0","children":{"Version":"1.22.0"}}',
            '{"value":"resolve@patch:resolve@npm%3A1.22.0#optional!builtin<compat/resolve>::version=1.22.0&hash=9bd1a5","children":{"Version":"1.22.0"}}',
            '{"value":"tiny@workspace:.","children":{"Version":"1.0.0"}}',
            ''
        ].join('\n');
        assert.deepEqual(YarnBerryStrategy.parseDependencies(output), [
            { name: '@cnakazawa/watch', version: '1.0.4' },
            { name: 'minimist', version: '1.2.0' },
            { name: 'minimist', version: '1.2.8' },
            { name: 'resolve', version: '1.22.0' }
        ]);
    });

    it('Deduplicate virtual and patched locators of the same package', () => {
        const output: string = [
            '{"value":"jest-config@virtual:aaa#npm:26.6.3"}',
            '{"value":"jest-config@virtual:bbb#npm:26.6.3"}',
            '{"value":"resolve@patch:resolve@npm%3A1.22.0#optional!builtin<compat/resolve>::version=1.22.0&hash=9bd1a5"}',
            '{"value":"resolve@npm:1.22.0"}'
        ].join('\n');
        assert.deepEqual(YarnBerryStrategy.parseDependencies(output), [
            { name: 'jest-config', version: '26.6.3' },
            { name: 'resolve', version: '1.22.0' }
        ]);
    });

    it('Ignore non JSON lines in yarn info output', () => {
        const output: string = 'Some warning\n{"value":"minimist@npm:1.2.0","children":{"Version":"1.2.0"}}\n';
        assert.deepEqual(YarnBerryStrategy.parseDependencies(output), [{ name: 'minimist', version: '1.2.0' }]);
    });

    it('Run yarn info once for the dependency list and all impact graphs', () => {
        const strategy: YarnBerryStrategy = new YarnBerryStrategy();
        const executeCmd: sinon.SinonStub = sinon
            .stub(ScanUtils, 'executeCmd')
            .returns(
                Buffer.from(
                    [
                        '{"value":"minimist@npm:1.2.0","children":{"Version":"1.2.0"}}',
                        '{"value":"tiny@workspace:.","children":{"Version":"1.0.0","Dependencies":[{"descriptor":"minimist@npm:^1.2.0","locator":"minimist@npm:1.2.0"}]}}'
                    ].join('\n')
                )
            );
        try {
            assert.deepEqual(strategy.listDependencies(''), [{ name: 'minimist', version: '1.2.0' }]);
            assert.deepEqual(strategy.createImpactGraph('minimist', '1.2.0', 'tiny:1.0.0', '').root, {
                name: 'tiny:1.0.0',
                children: [{ name: 'minimist:1.2.0' }]
            });
            strategy.createImpactGraph('minimist', '1.2.0', 'tiny:1.0.0', '');
            assert.equal(executeCmd.callCount, 1);
        } finally {
            executeCmd.restore();
        }
    });

    it('Upgrade command', () => {
        assert.equal(new YarnBerryStrategy().getUpgradeCommand('minimist', '1.2.8'), 'yarn up minimist@1.2.8');
        assert.equal(new YarnClassicStrategy().getUpgradeCommand('minimist', '1.2.8'), 'yarn upgrade minimist@1.2.8');
    });
});
