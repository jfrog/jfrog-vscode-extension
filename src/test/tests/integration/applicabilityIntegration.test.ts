import * as path from 'path';

import { assert } from 'chai';

import { ApplicabilityRunner, ApplicabilityScanResponse, CveApplicableDetails } from '../../../main/scanLogic/scanRunners/applicabilityScan';
import { PackageType } from '../../../main/types/projectType';
import { ScanUtils } from '../../../main/utils/scanUtils';

import { FileIssues, FileRegion } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { Utils } from '../../../main/utils/utils';
import { AnalyzerManagerIntegration } from '../utils/testIntegration.test';

describe('Contextual Analysis Integration Tests', async () => {
    let integration: AnalyzerManagerIntegration = new AnalyzerManagerIntegration();
    let runner: ApplicabilityRunner;

    const integrationRoot: string = path.join(__dirname, '..', 'resources', 'applicableScan', 'applicabilityScan');

    before(async () => {
        await integration.initialize();
        // Must be created after integration initialization
        runner = new ApplicabilityRunner(
            integration.connectionManager,
            ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            integration.logManager,
            integration.resource
        );
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
    });

    [
        {
            type: PackageType.Npm,
            directoryToScan: path.join(integrationRoot, 'npm'),
            expectedResponseContent: path.join(integrationRoot,'npm','expectedScanResponse.json')
        },
        {
            type: PackageType.Python,
            directoryToScan: path.join(integrationRoot, 'python'),
            expectedResponseContent: path.join(integrationRoot,'python','expectedScanResponse.json')
        }
    ].forEach(packgeTestInfo => {
        describe('Scan package - ' + packgeTestInfo.type, () => {
            //
        });
    })

    // describe('Generate response tests', () => {
    //     let response: ApplicabilityScanResponse;
    //     // The actual must contain at least the information from the partial
    //     let expectedPartialResponse: ApplicabilityScanResponse;

    //     before(() => {
    //         response = getDummyRunner().generateResponse(getAnalyzerScanRun(test.file));
    //         applicableCve = new Map<string, CveApplicableDetails>(Object.entries(response.applicableCve));
    //     });

    //     it('Check response defined', () => {
    //         assert.isDefined(response);
    //     });
    //     //
    //     it('Check response attributes defined', () => {
    //         assert.isDefined(response.applicableCve);
    //         assert.isDefined(response.scannedCve);
    //     });

    //     it('Check CVEs scanned', () => {
    //         assert.includeDeepMembers(testCase.cves, response.scannedCve);
    //     });

    // });

    // [
    //     ...testCases,
    //     {
    //         name: 'Analyzer run fails',
    //         file: undefined,
    //         expectedCves: [],
    //         expectedEvidence: []
    //     }
    // ].forEach(test => {
    //     describe('Generate response - ' + test.name, () => {
    //         let response: ApplicabilityScanResponse;
    //         let applicableCve: Map<string, CveApplicableDetails>;

    //         before(() => {
    //             response = getDummyRunner().generateResponse(getAnalyzerScanRun(test.file));
    //             if (test.file) {
    //                 applicableCve = new Map<string, CveApplicableDetails>(Object.entries(response.applicableCve));
    //             }

    //             fs.writeFileSync(path.join('/Users/assafa/Documents/code/jfrog-vscode-extension/src/test/resources/applicableScan',test.name),JSON.stringify(getAnalyzerScanRun(test.file)));
    //         });

    //         // it('Check response definition', () => {
    //         //     assert.isDefined(response);
    //         //     if (test.file) {
    //         //         assert.isDefined(response.applicableCve);
    //         //         assert.isDefined(response.scannedCve);
    //         //         assert.sameDeepMembers(test.expectedCves, response.scannedCve);
    //         //     } else {
    //         //         assert.isUndefined(response.scannedCve);
    //         //         assert.isUndefined(response.applicableCve);
    //         //     }
    //         // });

    //         if (test.file) {
    //             it('Check number of applicable Cve in response', () => {
    //                 assert.equal(applicableCve.size, test.expectedEvidence.length);
    //             });

    //             for (let evidence of test.expectedEvidence) {
    //                 describe('Check ' + evidence.cve + ' applicable evidences', () => {
    //                     let details: CveApplicableDetails | undefined;

    //                     before(() => {
    //                         details = applicableCve.get(evidence.cve);
    //                     });

    //                     it('Check Cve exists in scannedCve', () => {
    //                         assert.include(response.scannedCve, evidence.cve);
    //                     });

    //                     it('Check Cve exists in applicableCve', () => {
    //                         assert.isDefined(details, 'expected applicable cve contained in: ' + Array.from(applicableCve.keys()));
    //                     });

    //                     it('Check all evidences information exists', () => {
    //                         assert.equal(details?.fixReason, evidence.reason);
    //                         assert.include(details?.fullDescription, evidence.descriptionPartial);
    //                         assert.equal(details?.fileEvidences.length, evidence.files.length);
    //                     });

    //                     for (let fileEvidence of evidence.files) {
    //                         describe('Check evidence locations in file', () => {
    //                             let fileIssue: FileIssues | undefined;

    //                             before(() => {
    //                                 fileIssue = details?.fileEvidences.find(fileIssue => fileIssue.full_path === fileEvidence.file);
    //                             });

    //                             it('Check evidence exists', () => {
    //                                 assert.isDefined(
    //                                     fileIssue,
    //                                     'expected evidence for file ' + fileEvidence.file + ' in: ' + details?.fileEvidences.map(f => f.full_path)
    //                                 );
    //                                 assert.equal(fileIssue?.locations.length, fileEvidence.locations.length);
    //                             });

    //                             it('Check evidences in all locations exists', () => {
    //                                 for (let locationEvidence of fileEvidence.locations) {
    //                                     let location: FileRegion | undefined = fileIssue?.locations.find(
    //                                         fileLocation =>
    //                                             fileLocation.snippet?.text === locationEvidence.text &&
    //                                             fileLocation.startLine === locationEvidence.location[0] &&
    //                                             fileLocation.endLine === locationEvidence.location[1] &&
    //                                             fileLocation.startColumn === locationEvidence.location[2] &&
    //                                             fileLocation.endColumn === locationEvidence.location[3]
    //                                     );
    //                                     assert.isDefined(
    //                                         location,
    //                                         'expected evidence for text ' +
    //                                             locationEvidence.text +
    //                                             ' at location: Start(' +
    //                                             locationEvidence.location[0] +
    //                                             ',' +
    //                                             locationEvidence.location[2] +
    //                                             ') End(' +
    //                                             locationEvidence.location[1] +
    //                                             ',' +
    //                                             locationEvidence.location[3]
    //                                     );
    //                                 }
    //                             });
    //                         });
    //                     }
    //                 });
    //             }
    //         }
    //     });
    // });

    [
        {
            type: PackageType.Npm,
            cves: ['CVE-2021-3918', 'CVE-2021-3807', 'CVE-2022-25878'],
            expectedApplicable: [
                {
                    cve: 'CVE-2022-25878',
                    evidence: [
                        {
                            file: 'file://' + path.join(integrationRoot, 'npm', 'index.js'),
                            locations: [
                                {
                                    location: [21, 21, 1, 18],
                                    text: 'protobuf.parse(p)'
                                },
                                {
                                    location: [23, 23, 1, 74],
                                    text: 'protobuf.load("/path/to/untrusted.proto", function(err, root) { return })'
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            type: PackageType.Python,
            cves: ['CVE-2021-3918', 'CVE-2019-15605', 'CVE-2019-20907'],
            expectedApplicable: [
                {
                    cve: 'CVE-2019-20907',
                    evidence: [
                        {
                            file: 'file://' + path.join(integrationRoot, 'python', 'main.py'),
                            locations: [
                                {
                                    location: [17, 17, 7, 25],
                                    text: 'tarfile.open(name)'
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ].forEach(testCase => {
        describe('Scan package type - ' + PackageType[testCase.type], async () => {
            const testDirectory: string = path.join(integrationRoot, PackageType[testCase.type].toLowerCase());

            let response: ApplicabilityScanResponse;
            let applicableCves: Map<string, CveApplicableDetails>;

            before(async () => {
                // assert.doesNotThrow(async () => );
                response = await runner.scan(testDirectory, () => undefined, new Set<string>(testCase.cves));
                applicableCves = new Map<string, CveApplicableDetails>(Object.entries(response.applicableCve ?? []));
            });

            it('Check response generated', () => {
                assert.isDefined(response);
                assert.isDefined(response.scannedCve);
                assert.isDefined(response.applicableCve);
            });

            it('Check all CVEs scanned', () => {
                assert.sameDeepMembers(testCase.cves, response.scannedCve);
            });

            for (let applicableCve of testCase.expectedApplicable) {
                describe('Check ' + applicableCve.cve + ' applicable evidences', () => {
                    let details: CveApplicableDetails | undefined;

                    before(() => {
                        details = applicableCves.get(applicableCve.cve);
                    });

                    it('Check CVE exists in response as applicable', () => {
                        assert.isDefined(details, 'expected applicable cve contained in: ' + Array.from(applicableCves.keys()));
                    });

                    it('Check details contains all file evidences', () => {
                        assert.equal(details?.fileEvidences.length, applicableCve.evidence.length);
                    });

                    for (let fileEvidence of applicableCve.evidence) {
                        describe('Check evidence at locations in file: ' + Utils.getLastSegment(fileEvidence.file), () => {
                            let fileIssue: FileIssues | undefined;

                            before(() => {
                                fileIssue = details?.fileEvidences.find(fileIssue => fileIssue.full_path === fileEvidence.file);
                            });

                            it('Check file evidence exists', () => {
                                assert.isDefined(
                                    fileIssue,
                                    'expected evidence for file ' + fileEvidence.file + ' in: ' + details?.fileEvidences.map(f => f.full_path)
                                );
                            });

                            it('Check evidences in all locations exists', () => {
                                assert.equal(fileIssue?.locations.length, fileEvidence.locations.length);

                                for (let locationEvidence of fileEvidence.locations) {
                                    let location: FileRegion | undefined = fileIssue?.locations.find(
                                        fileLocation =>
                                            fileLocation.snippet?.text === locationEvidence.text &&
                                            fileLocation.startLine === locationEvidence.location[0] &&
                                            fileLocation.endLine === locationEvidence.location[1] &&
                                            fileLocation.startColumn === locationEvidence.location[2] &&
                                            fileLocation.endColumn === locationEvidence.location[3]
                                    );
                                    assert.isDefined(
                                        location,
                                        'expected evidence for text ' +
                                            locationEvidence.text +
                                            ' at location: Start(' +
                                            locationEvidence.location[0] +
                                            ',' +
                                            locationEvidence.location[2] +
                                            ') End(' +
                                            locationEvidence.location[1] +
                                            ',' +
                                            locationEvidence.location[3]
                                    );
                                }
                            });
                        });
                    }
                });
            }
        });
    });
});
