import * as path from 'path';

import { assert } from 'chai';

import { ApplicabilityRunner, ApplicabilityScanResponse, CveApplicableDetails } from '../../main/scanLogic/scanRunners/applicabilityScan';
import { PackageType } from '../../main/types/projectType';
import { ScanUtils } from '../../main/utils/scanUtils';
import { AnalyzerManagerIntegration } from './utils.test';
import { FileIssues, FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import { Utils } from '../../main/utils/utils';

describe('Contextual Analysis Integration Tests', async () => {
    let integration: AnalyzerManagerIntegration = new AnalyzerManagerIntegration();
    let runner: ApplicabilityRunner;

    const integrationRoot: string = path.join(__dirname, '..', 'resources', 'integration', 'applicabilityScan');

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
