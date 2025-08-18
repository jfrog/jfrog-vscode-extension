import * as path from 'path';
import { assert } from 'chai';
import { AnalyzerUtils } from '../../main/treeDataProviders/utils/analyzerUtils';

/**
 * Test functionality of @class AnalyzerUtils.
 */
describe('Analyzer Utils Tests', async () => {
    [
        {
            pattern: undefined,
            results: []
        },
        {
            pattern: '',
            results: []
        },
        {
            pattern: '**/*node_modules*',
            results: ['**/*node_modules*/**']
        },
        {
            pattern: '**/*{test}*',
            results: ['**/*test*/**']
        },
        {
            pattern: '**/*{test,venv,node_modules,target}*',
            results: ['**/*test*/**', '**/*venv*/**', '**/*node_modules*/**', '**/*target*/**']
        }
    ].forEach(testCase => {
        it('Get analyzer manager exclude pattern test - ' + testCase.pattern, () => {
            let results: string[] = AnalyzerUtils.getAnalyzerManagerExcludePatterns(testCase.pattern);
            assert.sameMembers(testCase.results, results);
        });
    });

    [path.join('somewhere', 'file'), path.join('somewhere', 'folder', 'file'), path.join(__dirname, 'file')].forEach(testCase => {
        it('Parse location file path test - ' + testCase, () => {
            let input: string = testCase.replace(/['\\']/g, '/');
            let result: string = AnalyzerUtils.parseLocationFilePath(`file://${input}`);
            assert.deepEqual(result, testCase);
        });
    });

    describe('Empty/Invalid location.physicalLocation validation tests for generateIssueData', () => {
        it('Should handle invalid physicalLocation scenarios without errors', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            const analyzeIssue = {
                locations: [
                    { physicalLocation: null },
                    { physicalLocation: undefined },
                    {
                        physicalLocation: {
                            artifactLocation: null,
                            region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
                        }
                    },
                    {
                        physicalLocation: {
                            artifactLocation: { uri: null },
                            region: { startLine: 2, endLine: 2, startColumn: 1, endColumn: 1 }
                        }
                    },
                    {
                        physicalLocation: {
                            artifactLocation: { uri: '' },
                            region: { startLine: 3, endLine: 3, startColumn: 1, endColumn: 1 }
                        }
                    }
                ]
            } as any;

            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, analyzeIssue, 'test description');
            });

            assert.equal(response.filesWithIssues.length, 0);
        });

        it('Should process valid locations correctly', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            const analyzeIssue = {
                locations: [
                    {
                        physicalLocation: {
                            artifactLocation: { uri: '/valid/path/file1.js' },
                            region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
                        }
                    },
                    {
                        physicalLocation: {
                            artifactLocation: { uri: '/valid/path/file2.js' },
                            region: { startLine: 2, endLine: 2, startColumn: 1, endColumn: 1 }
                        }
                    }
                ]
            } as any;

            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, analyzeIssue, 'test description');
            });

            assert.equal(response.filesWithIssues.length, 2);
            assert.equal(response.filesWithIssues[0].full_path, '/valid/path/file1.js');
            assert.equal(response.filesWithIssues[1].full_path, '/valid/path/file2.js');
        });
    });
});
