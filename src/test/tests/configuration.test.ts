import { assert } from 'chai';
import { Configuration } from '../../main/utils/configuration';

/**
 * Test functionality of @class Configuration.
 */
describe('Configuration Tests', () => {
    [
        {
            pattern: undefined
        },
        {
            pattern: ''
        },
        {
            pattern: '**/*folder*'
        },
        {
            pattern: '**/*{node_module}*'
        },
        {
            pattern: '**/*{test,venv,node_modules,target}*'
        },
        {
            pattern: '**/*{3fa_g3,f32fwt,f ld r,*target, folder*}*'
        },
        {
            pattern: 'test',
            errMsg: Configuration.PATTERN_NOT_MATCH
        },
        {
            pattern: 'node_module*',
            errMsg: Configuration.PATTERN_NOT_MATCH
        },
        {
            pattern: '**/*venv',
            errMsg: Configuration.PATTERN_NOT_MATCH
        },
        {
            pattern: '**/target*',
            errMsg: Configuration.PATTERN_NOT_MATCH
        },
        {
            pattern: '*{node_module, test}*',
            errMsg: Configuration.PATTERN_NOT_MATCH
        },
        {
            pattern: '**/*{node_module, {test, target}}*',
            errMsg: Configuration.BRACKET_ERROR
        },
        {
            pattern: '**/*{node_module, test}{_snapshot, _version}*',
            errMsg: Configuration.BRACKET_ERROR
        }
    ].forEach(testCase => {
        it('Exclude pattern validation test - ' + testCase.pattern, () => {
            if (testCase.errMsg) {
                assert.throw(() => Configuration.validateExcludeString(testCase.pattern), testCase.errMsg);
            } else {
                assert.doesNotThrow(() => Configuration.validateExcludeString(testCase.pattern));
            }
        });
    });
});
