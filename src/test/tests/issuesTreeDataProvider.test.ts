import { assert } from 'chai';
import { IssuesTreeDataProvider } from '../../main/treeDataProviders/issuesTree/issuesTreeDataProvider';
import { SupportedScans } from '../../main/scanLogic/scanManager';
import { Uri } from 'vscode';
import { PackageType } from '../../main/types/projectType';
import { ScanResults } from '../../main/types/workspaceIssuesDetails';
import { DependencyScanResults } from '../../main/types/workspaceIssuesDetails';
import { IacFileIssues, IacScanResponse } from '../../main/scanLogic/scanRunners/iacScan';
import { SecretsFileIssues, SecretsScanResponse } from '../../main/scanLogic/scanRunners/secretsScan';

/**
 * Test functionality of @class IssuesTreeDataProvider.
 */
describe('Issues Tree Data Provider Tests', () => {
    const dummyDescriptors: Map<PackageType, Uri[]> = getDummyDescriptors();

    [
        {
            test: 'Not supported',
            supported: {} as SupportedScans,
            expected: 0
        },
        {
            test: 'With dependencies scan',
            supported: { dependencies: true } as SupportedScans,
            expected: 5
        },
        {
            test: 'With advance scan',
            supported: { dependencies: true, applicability: true, iac: true, secrets: true } as SupportedScans,
            expected: 7
        }
    ].forEach(testCase => {
        it('Get number of tasks in repopulate - ' + testCase.test, () => {
            assert.equal(IssuesTreeDataProvider.getNumberOfTasksInRepopulate(testCase.supported, dummyDescriptors), testCase.expected);
        });
    });

    function getDummyDescriptors(): Map<PackageType, Uri[]> {
        let descriptors: Map<PackageType, Uri[]> = new Map<PackageType, Uri[]>();
        descriptors.set(PackageType.Unknown, [Uri.parse('/somewhere/file'), Uri.parse('/somewhere/other')]);
        descriptors.set(PackageType.Npm, [Uri.parse('/somewhere/other')]);
        // 2 package types + 3 files = 5 tasks
        return descriptors;
    }

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
        scanResult.iacScan = { filesWithIssues: [{} as IacFileIssues] } as IacScanResponse;
    }

    function addDummySecretsIssue(scanResult: ScanResults) {
        scanResult.secretsScan = { filesWithIssues: [{} as SecretsFileIssues] } as SecretsScanResponse;
    }
});
