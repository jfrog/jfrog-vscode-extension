import { assert } from 'chai';
import { ScanResults } from '../../main/types/workspaceIssuesDetails';
import { DependencyScanResults } from '../../main/types/workspaceIssuesDetails';
import { IacScanResponse } from '../../main/scanLogic/scanRunners/iacScan';
import { SecretsScanResponse } from '../../main/scanLogic/scanRunners/secretsScan';
import { FileWithSecurityIssues } from '../../main/treeDataProviders/utils/analyzerUtils';
import { SastFileIssues, SastScanResponse } from '../../main/scanLogic/scanRunners/sastScan';

/**
 * Test functionality of @class IssuesTreeDataProvider.
 */
describe('Issues Tree Data Provider Tests', () => {
    [
        {
            test: 'No issues',
            scanResult: new ScanResults('path'),
            expected: false
        },
        {
            test: 'With dependency issues',
            scanResult: new ScanResults('path'),
            prepareDummy: (scanResult: ScanResults) => addDummyDependencyIssue(scanResult),
            expected: true
        },
        {
            test: 'With iac issues',
            scanResult: new ScanResults('path'),
            prepareDummy: (scanResult: ScanResults) => addDummyIacIssue(scanResult),
            expected: true
        },
        {
            test: 'With secrets issues',
            scanResult: new ScanResults('path'),
            prepareDummy: (scanResult: ScanResults) => addDummySecretsIssue(scanResult),
            expected: true
        },
        {
            test: 'With sast issues',
            scanResult: new ScanResults('path'),
            prepareDummy: (scanResult: ScanResults) => addDummySastIssue(scanResult),
            expected: true
        }
    ].forEach(testCase => {
        it('ScanResult has issues - ' + testCase.test, () => {
            if (testCase.prepareDummy) {
                testCase.prepareDummy(testCase.scanResult);
            }
            assert.equal(testCase.scanResult.hasIssues(), testCase.expected);
        });
    });

    function addDummyDependencyIssue(scanResult: ScanResults) {
        scanResult.descriptorsIssues.push({} as DependencyScanResults);
    }

    function addDummyIacIssue(scanResult: ScanResults) {
        scanResult.iacScan = { filesWithIssues: [{} as FileWithSecurityIssues] } as IacScanResponse;
    }

    function addDummySecretsIssue(scanResult: ScanResults) {
        scanResult.secretsScan = { filesWithIssues: [{} as FileWithSecurityIssues] } as SecretsScanResponse;
    }

    function addDummySastIssue(scanResult: ScanResults) {
        scanResult.sastScan = { filesWithIssues: [{} as SastFileIssues] } as SastScanResponse;
    }
});
