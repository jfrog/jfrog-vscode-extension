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
        it('Get applicable exclude pattern test - ' + testCase.pattern, () => {
            let results: string[] = AnalyzerUtils.getApplicableExcludePattern(testCase.pattern);
            assert.sameMembers(testCase.results, results);
        });
    });

    [
        {
            filePath: '',
            expected: ''
        }
    ].forEach(testCase => {
        it('Parse location file path test - ' + testCase.filePath, () => {
            let result: string = AnalyzerUtils.parseLocationFilePath(testCase.filePath);
            assert.deepEqual(result, testCase.expected);
        });
    });
});
