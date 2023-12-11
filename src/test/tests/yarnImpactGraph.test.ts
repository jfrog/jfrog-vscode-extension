import { IImpactGraph } from 'jfrog-ide-webview';
import { YarnImpactGraphCreator, YarnWhyItem } from '../../main/treeDataProviders/utils/yarnImpactGraph';
import { assert } from 'chai';
import { LogManager } from '../../main/log/logManager';
import { RootNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';

describe('Yarn impact graph util', async () => {
    it('Build single impact graph', async () => {
        const results: IImpactGraph = new YarnImpactGraphUtilMock('minimist', '0.0.8', 'Mock-Project', '', new LogManager().activate()).create();
        assert.deepEqual(results, generateExpectedSingleImpactGraph());
    });

    it('Build multiple impact graphs', async () => {
        const results: IImpactGraph = new YarnImpactGraphUtilMock('minimist', '1.2.0', 'Mock-Project', '', new LogManager().activate()).create();
        assert.deepEqual(results, generateExpectedMultipleImpactGraphs());
    });

    it('Limit total impact graphs', async () => {
        let results: IImpactGraph = new YarnImpactGraphUtilMock('minimist', '1.2.0', 'Mock-Project', '', new LogManager().activate()).create();

        // Assert that pathsLimit is initially undefined (no limit set)
        assert.isUndefined(results.pathsLimit);

        const ORIGIN_IMPACT_PATHS_LIMIT: number = RootNode.IMPACT_PATHS_LIMIT;
        RootNode.IMPACT_PATHS_LIMIT = 1;

        results = new YarnImpactGraphUtilMock('minimist', '1.2.0', 'Mock-Project', '', new LogManager().activate()).create();

        // Assert that pathsLimit is correctly set to the limit (1 in this case)
        assert.deepEqual(results.pathsLimit, 1);

        RootNode.IMPACT_PATHS_LIMIT = ORIGIN_IMPACT_PATHS_LIMIT;
    });
});

class YarnImpactGraphUtilMock extends YarnImpactGraphCreator {
    protected runYarnWhy(): YarnWhyItem[] {
        const yarnWhyOutput: YarnWhyItem[] = [
            {
                type: 'info',
                data: '\r=> Found "minimist@1.2.0"'
            },
            {
                type: 'info',
                data: 'Has been hoisted to "minimist"'
            },
            {
                type: 'info',
                data: 'Reasons this module exists'
            },
            {
                type: 'list',
                data: {
                    type: 'reasons',
                    items: [
                        'Specified in "dependencies"',
                        'Hoisted from "jest-cli#node-notifier#minimist"',
                        'Hoisted from "jest-cli#sane#minimist"',
                        'Hoisted from "jest-cli#istanbul-lib-instrument#babel-generator#detect-indent#minimist"'
                    ]
                }
            },
            {
                type: 'info',
                data: 'Disk size without dependencies: "96KB"'
            },
            {
                type: 'info',
                data: '\r=> Found "mkdirp#minimist@0.0.8"'
            },
            {
                type: 'info',
                data: 'This module exists because "jest-cli#istanbul-api#mkdirp" depends on it.'
            }
        ];
        return yarnWhyOutput;
    }
}

function generateExpectedSingleImpactGraph(): IImpactGraph {
    return {
        root: {
            name: 'Mock-Project',
            children: [
                {
                    name: 'jest-cli',
                    children: [
                        {
                            name: 'istanbul-api',
                            children: [
                                {
                                    name: 'mkdirp',
                                    children: [
                                        {
                                            name: 'minimist:0.0.8'
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        pathsLimit: undefined
    };
}

function generateExpectedMultipleImpactGraphs(): IImpactGraph {
    return {
        root: {
            name: 'Mock-Project',
            children: [
                {
                    name: 'minimist:1.2.0'
                },
                {
                    name: 'jest-cli',
                    children: [
                        {
                            name: 'node-notifier',
                            children: [
                                {
                                    name: 'minimist:1.2.0'
                                }
                            ]
                        },
                        {
                            name: 'sane',
                            children: [
                                {
                                    name: 'minimist:1.2.0'
                                }
                            ]
                        },
                        {
                            name: 'istanbul-lib-instrument',
                            children: [
                                {
                                    name: 'babel-generator',
                                    children: [
                                        {
                                            name: 'detect-indent',
                                            children: [
                                                {
                                                    name: 'minimist:1.2.0'
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        pathsLimit: undefined
    };
}
