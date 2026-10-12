import { assert } from 'chai';
import { IImpactGraph } from 'jfrog-ide-webview';
import { LogManager } from '../../main/log/logManager';
import { RootNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { YarnBerryImpactGraphCreator, YarnBerryWhyItem } from '../../main/treeDataProviders/utils/yarnBerryImpactGraph';

describe('Yarn Berry impact graph', () => {
    it('Build impact graph for a direct and a transitive dependency', () => {
        const results: IImpactGraph = new YarnBerryImpactGraphMock('minimist', '1.2.8', 'tiny:1.0.0').create();
        assert.deepEqual(results, {
            root: {
                name: 'tiny:1.0.0',
                children: [{ name: '@cnakazawa/watch:1.0.4', children: [{ name: 'minimist:1.2.8' }] }]
            },
            pathsLimit: undefined
        });
    });

    it('Filter by version', () => {
        const results: IImpactGraph = new YarnBerryImpactGraphMock('minimist', '1.2.0', 'tiny:1.0.0').create();
        assert.deepEqual(results, { root: { name: 'tiny:1.0.0', children: [{ name: 'minimist:1.2.0' }] }, pathsLimit: undefined });
    });

    it('Dependency not found', () => {
        assert.deepEqual(new YarnBerryImpactGraphMock('minimist', '9.9.9', 'tiny:1.0.0').create(), {} as IImpactGraph);
    });

    it('Limit total impact paths', () => {
        const originLimit: number = RootNode.IMPACT_PATHS_LIMIT;
        RootNode.IMPACT_PATHS_LIMIT = 1;
        try {
            const results: IImpactGraph = new YarnBerryImpactGraphMock('minimist', '1.2.8', 'tiny:1.0.0', true).create();
            assert.deepEqual(results.pathsLimit, 1);
            assert.lengthOf(results.root?.children ?? [], 1);
        } finally {
            RootNode.IMPACT_PATHS_LIMIT = originLimit;
        }
    });
});

class YarnBerryImpactGraphMock extends YarnBerryImpactGraphCreator {
    constructor(name: string, version: string, projectName: string, private _extraPath: boolean = false) {
        super(name, version, projectName, '', new LogManager().activate());
    }

    protected runYarnWhy(): YarnBerryWhyItem[] {
        const children: { [key: string]: YarnBerryWhyItem } = {
            '@cnakazawa/watch@npm:1.0.4': {
                value: { locator: '@cnakazawa/watch@npm:1.0.4', descriptor: '@cnakazawa/watch@npm:1.0.4' },
                children: {
                    'minimist@npm:1.2.8': { value: { locator: 'minimist@npm:1.2.8', descriptor: 'minimist@npm:^1.2.0' }, children: {} }
                }
            },
            'minimist@npm:1.2.0': { value: { locator: 'minimist@npm:1.2.0', descriptor: 'minimist@npm:1.2.0' }, children: {} }
        };
        if (this._extraPath) {
            children['other@virtual:abc#npm:2.0.0'] = {
                value: { locator: 'other@virtual:abc#npm:2.0.0', descriptor: 'other@npm:^2.0.0' },
                children: { 'minimist@npm:1.2.8': { value: { locator: 'minimist@npm:1.2.8', descriptor: 'minimist@npm:^1.0.0' }, children: {} } }
            };
        }
        return [{ value: 'tiny@workspace:.', children }];
    }
}
