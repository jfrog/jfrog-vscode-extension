import { assert } from 'chai';
import { IssuesTreeDataProvider } from '../../main/treeDataProviders/issuesTree/issuesTreeDataProvider';
import { EntitledScans } from '../../main/scanLogic/scanManager';
import { Uri } from 'vscode';
import { PackageType } from '../../main/types/projectType';
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
    const dummyDescriptors: Map<PackageType, Uri[]> = getDummyDescriptors();

    [
        {
            test: 'Not supported',
            supported: {} as EntitledScans,
            expected: 0
        },
        {
            test: 'With dependencies scan',
            supported: { dependencies: true } as EntitledScans,
            expected: 5
        },
        {
            test: 'With advance scan',
            supported: { dependencies: true, applicability: true, iac: true, secrets: true } as EntitledScans,
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
