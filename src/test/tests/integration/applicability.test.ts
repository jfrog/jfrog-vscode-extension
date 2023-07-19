import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';

import { ApplicabilityRunner, ApplicabilityScanResponse, CveApplicableDetails } from '../../../main/scanLogic/scanRunners/applicabilityScan';

import { AnalyzerManagerIntegrationEnv } from '../utils/testIntegration.test';
import { FileIssues, FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { AnalyzerUtils } from '../../../main/treeDataProviders/utils/analyzerUtils';
import { ScanUtils } from '../../../main/utils/scanUtils';

describe('Applicability Integration Tests', async () => {
    let integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    let runner: ApplicabilityRunner;

    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'applicableScan');

    before(async () => {
        await integrationManager.initialize();
        // Must be created after integration initialization
        runner = new ApplicabilityRunner(integrationManager.connectionManager, integrationManager.logManager, integrationManager.resource, ScanUtils.ANALYZER_TIMEOUT_MILLISECS, true);
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
    });

    ['npm', 'python'].forEach(async packageType => {
        let directoryToScan: string = path.join(testDataRoot, packageType);
        runScanAndAssert(packageType, directoryToScan, path.join(directoryToScan, 'expectedScanResponse.json'));
    });

    async function runScanAndAssert(type: string, directoryToScan: string, expectedResponseContentPath: string) {
        describe('Scan ' + type + ' workspace for applicable issues', () => {
            let response: ApplicabilityScanResponse;
            let expectedContent: ApplicabilityScanResponse;

            before(async () => {
                // Get expected partial result that the scan should contain
                expectedContent = JSON.parse(fs.readFileSync(expectedResponseContentPath, 'utf8').toString());
                assert.isDefined(expectedContent, 'Failed to read expected ApplicabilityScanResponse content from ' + expectedResponseContentPath);
                // Run scan
                response = await runner.scan(directoryToScan, () => undefined, new Set<string>(expectedContent.scannedCve));
            });

            it('Check response defined', () => {
                assert.isDefined(response);
            });

            it('Check response attributes defined', () => {
                assert.isDefined(response.applicableCve);
                assert.isDefined(response.scannedCve);
            });

            it('Check all expected CVEs scanned', () => {
                assert.includeDeepMembers(response.scannedCve, expectedContent.scannedCve);
            });

            it('Check all expected applicable CVE detected', () => {
                assert.includeDeepMembers(Object.keys(response.applicableCve), Object.keys(expectedContent.applicableCve));
            });

            describe('Applicable details data validations', () => {
                let expectedApplicableCves: Map<string, CveApplicableDetails>;
                let responseApplicableCves: Map<string, CveApplicableDetails>;

                before(() => {
                    expectedApplicableCves = new Map<string, CveApplicableDetails>(Object.entries(expectedContent.applicableCve ?? []));
                    assert.isNotEmpty(expectedApplicableCves);
                    responseApplicableCves = new Map<string, CveApplicableDetails>(Object.entries(response.applicableCve ?? []));
                });

                function getResponseApplicableDetails(cve: string): CveApplicableDetails {
                    let details: CveApplicableDetails | undefined = responseApplicableCves.get(cve);
                    if (!details) {
                        assert.fail('Expected ' + cve + ' to be detected as applicable issue');
                    }
                    return details;
                }

                it('Check fixReason data exists', () => {
                    expectedApplicableCves.forEach((expectedDetails: CveApplicableDetails, cve: string) => {
                        assert.deepEqual(getResponseApplicableDetails(cve).fixReason, expectedDetails.fixReason);
                    });
                });

                it('Check fullDescription data exists', () => {
                    expectedApplicableCves.forEach((expectedDetails: CveApplicableDetails, cve: string) => {
                        assert.deepEqual(getResponseApplicableDetails(cve).fullDescription, expectedDetails.fullDescription);
                        expectedDetails.fileEvidences;
                    });
                });

                it('Check all expected evidence files exists', () => {
                    expectedApplicableCves.forEach((expectedDetails: CveApplicableDetails, cve: string) => {
                        assert.includeDeepMembers(
                            getResponseApplicableDetails(cve).fileEvidences.map(evidence => AnalyzerUtils.parseLocationFilePath(evidence.full_path)),
                            expectedDetails.fileEvidences.map(evidence => path.join(directoryToScan, evidence.full_path))
                        );
                    });
                });

                describe('Applicable Evidences data', () => {
                    function getResponseLocation(cve: string, filePath: string, location: FileRegion): FileRegion {
                        let actualPath: string = path.join(directoryToScan, filePath);
                        let actualDetails: CveApplicableDetails = getResponseApplicableDetails(cve);
                        let fileIssues: FileIssues | undefined = actualDetails.fileEvidences.find(
                            actualFileIssues => AnalyzerUtils.parseLocationFilePath(actualFileIssues.full_path) === actualPath
                        );
                        if (!fileIssues) {
                            assert.fail('Expected ' + cve + ' should contain applicable evidence in file ' + actualPath);
                        }
                        let issue: FileRegion | undefined = fileIssues.locations.find((actualLocation: FileRegion) =>
                            AnalyzerUtils.isSameRegion(location, actualLocation)
                        );
                        if (!issue) {
                            assert.fail(
                                'Expected file ' +
                                    actualPath +
                                    ' should contain evidence in location ' +
                                    [location.startLine, location.endLine, location.startColumn, location.endColumn]
                            );
                        }
                        return issue;
                    }

                    it('Check all expected locations exists', () => {
                        expectedApplicableCves.forEach((expectedDetails: CveApplicableDetails, cve: string) => {
                            expectedDetails.fileEvidences.forEach((expectedFileIssues: FileIssues) => {
                                expectedFileIssues.locations.forEach((expectedLocation: FileRegion) => {
                                    assert.isDefined(getResponseLocation(cve, expectedFileIssues.full_path, expectedLocation));
                                });
                            });
                        });
                    });

                    it('Check snippet data', () => {
                        expectedApplicableCves.forEach((expectedDetails: CveApplicableDetails, cve: string) => {
                            expectedDetails.fileEvidences.forEach((expectedFileIssues: FileIssues) => {
                                expectedFileIssues.locations.forEach((expectedLocation: FileRegion) => {
                                    assert.deepEqual(
                                        getResponseLocation(cve, expectedFileIssues.full_path, expectedLocation).snippet,
                                        expectedLocation.snippet
                                    );
                                });
                            });
                        });
                    });
                });
            });
        });
    }
});
