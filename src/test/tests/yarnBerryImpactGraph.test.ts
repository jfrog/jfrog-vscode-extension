import { assert } from 'chai';
import { IImpactGraph } from 'jfrog-ide-webview';
import { LogManager } from '../../main/log/logManager';
import { RootNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { YarnBerryImpactGraphCreator, YarnBerryInfoEntry } from '../../main/treeDataProviders/utils/yarnBerryImpactGraph';

function entry(value: string, version: string, dependencies: string[] = []): YarnBerryInfoEntry {
    return { value, children: { Version: version, Dependencies: dependencies.map(locator => ({ descriptor: locator, locator })) } };
}

const SINGLE_PROJECT: YarnBerryInfoEntry[] = [
    entry('@cnakazawa/watch@npm:1.0.4', '1.0.4', ['minimist@npm:1.2.8']),
    entry('minimist@npm:1.2.0', '1.2.0'),
    entry('minimist@npm:1.2.8', '1.2.8'),
    entry('tiny@workspace:.', '1.0.0', ['@cnakazawa/watch@npm:1.0.4', 'minimist@npm:1.2.0'])
];

const MONOREPO: YarnBerryInfoEntry[] = [
    entry('lodash@npm:4.17.20', '4.17.20'),
    entry('minimist@npm:1.2.0', '1.2.0'),
    entry('resolve@npm:1.22.0', '1.22.0', ['minimist@npm:1.2.0']),
    entry('resolve@patch:resolve@npm%3A1.22.0#optional!builtin<compat/resolve>::version=1.22.0&hash=9bd1a5', '1.22.0', ['minimist@npm:1.2.0']),
    entry('root@workspace:.', '1.0.0'),
    entry('@complex/app@workspace:packages/app', '1.0.0', ['@complex/lib-core@workspace:packages/lib-core', 'lodash@npm:4.17.20']),
    entry('@complex/lib-core@workspace:packages/lib-core', '1.0.0', [
        'resolve@patch:resolve@npm%3A1.22.0#optional!builtin<compat/resolve>::version=1.22.0&hash=9bd1a5'
    ])
];

describe('Yarn Berry impact graph', () => {
    it('Build impact graph for a transitive dependency', () => {
        assert.deepEqual(create('minimist', '1.2.8', SINGLE_PROJECT), {
            root: { name: 'tiny:1.0.0', children: [{ name: '@cnakazawa/watch:1.0.4', children: [{ name: 'minimist:1.2.8' }] }] },
            pathsLimit: undefined
        });
    });

    it('Filter by version', () => {
        assert.deepEqual(create('minimist', '1.2.0', SINGLE_PROJECT), {
            root: { name: 'tiny:1.0.0', children: [{ name: 'minimist:1.2.0' }] },
            pathsLimit: undefined
        });
    });

    it('Dependency not found', () => {
        assert.deepEqual(create('minimist', '9.9.9', SINGLE_PROJECT), {} as IImpactGraph);
    });

    it('Monorepo - dependency of a workspace', () => {
        assert.deepEqual(create('lodash', '4.17.20', MONOREPO), {
            root: { name: 'tiny:1.0.0', children: [{ name: '@complex/app:1.0.0', children: [{ name: 'lodash:4.17.20' }] }] },
            pathsLimit: undefined
        });
    });

    it('Monorepo - dependency of a workspace that other workspaces depend on', () => {
        assert.deepEqual(create('minimist', '1.2.0', MONOREPO), {
            root: {
                name: 'tiny:1.0.0',
                children: [{ name: '@complex/lib-core:1.0.0', children: [{ name: 'resolve:1.22.0', children: [{ name: 'minimist:1.2.0' }] }] }]
            },
            pathsLimit: undefined
        });
    });

    it('Dependency cycles', () => {
        const entries: YarnBerryInfoEntry[] = [
            entry('a@npm:1.0.0', '1.0.0', ['b@npm:1.0.0']),
            entry('b@npm:1.0.0', '1.0.0', ['a@npm:1.0.0', 'c@npm:1.0.0']),
            entry('c@npm:1.0.0', '1.0.0'),
            entry('tiny@workspace:.', '1.0.0', ['a@npm:1.0.0'])
        ];
        assert.deepEqual(create('c', '1.0.0', entries), {
            root: { name: 'tiny:1.0.0', children: [{ name: 'a:1.0.0', children: [{ name: 'b:1.0.0', children: [{ name: 'c:1.0.0' }] }] }] },
            pathsLimit: undefined
        });
    });

    it('Limit total impact paths', () => {
        const entries: YarnBerryInfoEntry[] = [
            entry('a@npm:1.0.0', '1.0.0', ['minimist@npm:1.2.0']),
            entry('b@npm:1.0.0', '1.0.0', ['minimist@npm:1.2.0']),
            entry('minimist@npm:1.2.0', '1.2.0'),
            entry('tiny@workspace:.', '1.0.0', ['a@npm:1.0.0', 'b@npm:1.0.0'])
        ];
        const originLimit: number = RootNode.IMPACT_PATHS_LIMIT;
        try {
            assert.isUndefined(create('minimist', '1.2.0', entries).pathsLimit);
            RootNode.IMPACT_PATHS_LIMIT = 1;
            const results: IImpactGraph = create('minimist', '1.2.0', entries);
            assert.equal(results.pathsLimit, 1);
            assert.lengthOf(results.root?.children ?? [], 1);
        } finally {
            RootNode.IMPACT_PATHS_LIMIT = originLimit;
        }
    });
});

function create(name: string, version: string, entries: YarnBerryInfoEntry[]): IImpactGraph {
    return new YarnBerryImpactGraphMock(name, version, 'tiny:1.0.0', entries).create();
}

class YarnBerryImpactGraphMock extends YarnBerryImpactGraphCreator {
    constructor(name: string, version: string, projectName: string, private _entries: YarnBerryInfoEntry[]) {
        super(name, version, projectName, '', new LogManager().activate());
    }

    protected runYarnInfo(): YarnBerryInfoEntry[] {
        return this._entries;
    }
}
