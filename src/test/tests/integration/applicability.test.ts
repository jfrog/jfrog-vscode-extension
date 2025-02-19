import { assert } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    ApplicabilityRunner,
    ApplicabilityScanArgs,
    ApplicabilityScanResponse,
    CveApplicableDetails
} from '../../../main/scanLogic/scanRunners/applicabilityScan';
import { FileIssues, FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { AnalyzerUtils } from '../../../main/treeDataProviders/utils/analyzerUtils';
import { AnalyzerManagerIntegrationEnv } from '../utils/testIntegration.test';
import { PackageType } from '../../../main/types/projectType';
import { Applicability } from '../../../../../jfrog-ide-webview';

describe('Applicability Integration Tests', async () => {
    let integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    let runner: ApplicabilityRunner;

    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'applicableScan');

    before(async () => {
        await integrationManager.initialize();
        // Must be created after integration initialization
        const applicableRunner: ApplicabilityRunner | undefined = await integrationManager.entitledJasRunnerFactory.createApplicabilityRunner(
            [],
            PackageType.Unknown
        );
        assert.isDefined(applicableRunner);
        runner = applicableRunner!;
    });

    ['npm', 'python'].forEach(async packageType => {
        let directoryToScan: string = path.join(testDataRoot, packageType);
        if (os.platform() === 'win32') {
            // make the first char uppercase
            directoryToScan = directoryToScan.charAt(0).toUpperCase() + directoryToScan.slice(1);
        }
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
                response = await runner
                    .executeRequest(() => undefined, {
                        roots: [directoryToScan],
                        cve_whitelist: expectedContent.scannedCve,
                        indirect_cve_whitelist: expectedContent.indirectCve
                    } as ApplicabilityScanArgs)
                    .then(runResult => runner.convertResponse(runResult))
                    .catch(err => assert.fail(err));
            });

            it('Check response defined', () => {
                assert.isDefined(response);
            });

            it('Check response attributes defined', () => {
                assert.isDefined(response.cvesWithApplicableStates);
                assert.isDefined(response.scannedCve);
            });

            it('Check all expected CVEs scanned', () => {
                assert.includeDeepMembers(response.scannedCve, expectedContent.scannedCve);
            });

            it('Check all expected applicable CVE detected', () => {
                const applicableCVesInResponse: string[] = Object.keys(response.cvesWithApplicableStates).filter(key => response.cvesWithApplicableStates[key].applicability === Applicability.APPLICABLE);
                const expectedApplicableCVesInResponse: string[] =  Object.keys(response.cvesWithApplicableStates).filter(key => response.cvesWithApplicableStates[key].applicability === Applicability.APPLICABLE);

                assert.includeDeepMembers(applicableCVesInResponse, expectedApplicableCVesInResponse);
            });

            it('Check all expected notApplicableCve CVE detected', () => {
                    const notApplicableCvesInResponse: string[] = Object.keys(response.cvesWithApplicableStates).filter(key => response.cvesWithApplicableStates[key].applicability === Applicability.NOT_APPLICABLE);
                    const expectedNotApplicableCves: string[] =  Object.keys(response.cvesWithApplicableStates).filter(key => response.cvesWithApplicableStates[key].applicability === Applicability.NOT_APPLICABLE);

                    assert.includeDeepMembers(notApplicableCvesInResponse, expectedNotApplicableCves);
                });


            describe('Applicable details data validations', () => {
                let expectedApplicableCves: Map<string, CveApplicableDetails>;
                let responseApplicableCves: Map<string, CveApplicableDetails>;

                before(() => {
                    expectedApplicableCves = new Map(
                        Object.entries(expectedContent.cvesWithApplicableStates).filter(
                            ([, details]) => details.applicability === Applicability.APPLICABLE
                        )
                    );
                    assert.isNotEmpty(expectedApplicableCves);
                    responseApplicableCves = new Map<string, CveApplicableDetails>(Object.entries(response.cvesWithApplicableStates ?? []));
                });

                function getResponseApplicableDetails(cve: string): CveApplicableDetails {
                    let details: CveApplicableDetails | undefined = responseApplicableCves.get(cve);
                    if (!details) {
                        assert.fail('Expected ' + cve + ' to be detected as applicable issue');
                    }
                    return details;
                }

                it('Check fixReason data exists', () => {
                    expectedApplicableCves.forEach((_expectedDetails: CveApplicableDetails, cve: string) => {
                        assert.isNotEmpty(getResponseApplicableDetails(cve).fixReason);
                    });
                });

                it('Check fullDescription data exists', () => {
                    expectedApplicableCves.forEach((_expectedDetails: CveApplicableDetails, cve: string) => {
                        assert.isNotEmpty(getResponseApplicableDetails(cve).fullDescription);
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

                    it('Check all expected locations exists', async function() {
                        expectedApplicableCves.forEach((expectedDetails: CveApplicableDetails, cve: string) => {
                            expectedDetails.fileEvidences.forEach((expectedFileIssues: FileIssues) => {
                                expectedFileIssues.locations.forEach((expectedLocation: FileRegion) => {
                                    assert.isDefined(getResponseLocation(cve, expectedFileIssues.full_path, expectedLocation));
                                });
                            });
                        });
                    });

                    it('Check snippet data', async function() {
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
