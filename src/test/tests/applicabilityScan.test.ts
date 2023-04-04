import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';

import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import {
    ApplicabilityRunner,
    CveApplicableDetails,
    ApplicabilityScanArgs,
    ApplicabilityScanResponse
} from '../../main/scanLogic/scanRunners/applicabilityScan';
import { ScanUtils } from '../../main/utils/scanUtils';
import { AnalyzerScanResponse, AnalyzerScanRun, FileIssues, FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { createDummyCveIssue, createDummyDependencyIssues, createRootTestNode } from './utils/treeNodeUtils.test';
import { DescriptorTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { PackageType } from '../../main/types/projectType';
import { DependencyScanResults } from '../../main/types/workspaceIssuesDetails';
import { AnalyzerUtils } from '../../main/treeDataProviders/utils/analyzerUtils';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { Severity } from '../../main/types/severity';
import { CveTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { FileTreeNode } from '../../main/treeDataProviders/issuesTree/fileTreeNode';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { ApplicableTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/applicableTreeNode';

let logManager: LogManager = new LogManager().activate();

describe('Contextual Analysis Scan Tests', () => {
    const scanResponses: string = path.join(__dirname, '..', 'resources', 'scanResponses');

    [
        {
            name: 'One root',
            roots: ['/path/to/root'],
            cves: ['CVE-2021-3918'],
            skip: []
        },
        {
            name: 'Multiple roots',
            roots: ['/path/to/root', '/path/to/other'],
            cves: ['CVE-2021-3918', 'CVE-2021-3807', 'CVE-2022-25878'],
            skip: ['/path/to/root']
        }
    ].forEach(test => {
        it('Generate Yaml request - ' + test.name, () => {
            let request: ApplicabilityScanArgs = getApplicabilityScanRequest(test.roots, test.cves, test.skip);
            assert.deepEqual(getDummyRunner().requestsToYaml(request), getExpectedYaml(request));
        });
    });

    function getApplicabilityScanRequest(roots: string[], cves: string[], skipFolders: string[]): ApplicabilityScanArgs {
        return {
            type: 'analyze-applicability',
            output: '/path/to/output.json',
            roots: roots,
            cve_whitelist: cves,
            skipped_folders: skipFolders
        } as ApplicabilityScanArgs;
    }

    function getExpectedYaml(request: ApplicabilityScanArgs): string {
        let expected: string = 'scans:\n' + '  - type: ' + request.type + '\n' + '    output: ' + request.output + '\n';
        expected += '    roots:\n';
        for (let root of request.roots) {
            expected += '      - ' + root + '\n';
        }
        expected += '    cve-whitelist:\n';
        for (let cve of request.cve_whitelist) {
            expected += '      - ' + cve + '\n';
        }
        expected += '    skipped-folders:' + (request.skipped_folders.length === 0 ? ' []' : '') + '\n';
        for (let skip of request.skipped_folders) {
            expected += '      - ' + skip + '\n';
        }
        return expected;
    }

    let testCases: any[] = [
        {
            name: 'No applicable issues',
            file: path.join(scanResponses, 'scanNotApplicable.json'),
            expectedIssueCount: 0,
            expectedCves: ['CVE-2021-3918'],
            expectedEvidence: []
        },
        {
            name: 'With applicable issues',
            file: path.join(scanResponses, 'scanApplicable.json'),
            expectedIssueCount: 2,
            expectedCves: ['CVE-2021-3918', 'CVE-2021-3807', 'CVE-2022-25878'],
            expectedEvidence: [
                {
                    cve: 'CVE-2022-25878',
                    reason:
                        'The vulnerable function protobufjs.parse is called with external input, The vulnerable function protobufjs.load is called',
                    descriptionPartial: 'The scanner checks whether any of the following vulnerable functions are called',
                    files: [
                        {
                            file: 'file:///examples/applic-demo/../applic-demo/index.js',
                            locations: [
                                {
                                    // start-line,end-line,start-col,end-col
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
        }
    ];

    [
        ...testCases,
        {
            name: 'Analyzer run fails',
            file: undefined,
            expectedCves: [],
            expectedEvidence: []
        }
    ].forEach(test => {
        describe('Generate response - ' + test.name, () => {
            let response: ApplicabilityScanResponse;
            let applicableCve: Map<string, CveApplicableDetails>;

            before(() => {
                response = getDummyRunner().generateResponse(getAnalyzerScanRun(test.file));
                if (test.file) {
                    applicableCve = new Map<string, CveApplicableDetails>(Object.entries(response.applicableCve));
                }
            });

            it('Check response definition', () => {
                assert.isDefined(response);
                if (test.file) {
                    assert.isDefined(response.applicableCve);
                    assert.isDefined(response.scannedCve);
                    assert.sameDeepMembers(test.expectedCves, response.scannedCve);
                } else {
                    assert.isUndefined(response.scannedCve);
                    assert.isUndefined(response.applicableCve);
                }
            });

            if (test.file) {
                it('Check number of applicable Cve in response', () => {
                    assert.equal(applicableCve.size, test.expectedEvidence.length);
                });

                for (let evidence of test.expectedEvidence) {
                    describe('Check ' + evidence.cve + ' applicable evidences', () => {
                        let details: CveApplicableDetails | undefined;

                        before(() => {
                            details = applicableCve.get(evidence.cve);
                        });

                        it('Check Cve exists in scannedCve', () => {
                            assert.include(response.scannedCve, evidence.cve);
                        });

                        it('Check Cve exists in applicableCve', () => {
                            assert.isDefined(details, 'expected applicable cve contained in: ' + Array.from(applicableCve.keys()));
                        });

                        it('Check all evidences information exists', () => {
                            assert.equal(details?.fixReason, evidence.reason);
                            assert.include(details?.fullDescription, evidence.descriptionPartial);
                            assert.equal(details?.fileEvidences.length, evidence.files.length);
                        });

                        for (let fileEvidence of evidence.files) {
                            describe('Check evidence locations in file', () => {
                                let fileIssue: FileIssues | undefined;

                                before(() => {
                                    fileIssue = details?.fileEvidences.find(fileIssue => fileIssue.full_path === fileEvidence.file);
                                });

                                it('Check evidence exists', () => {
                                    assert.isDefined(
                                        fileIssue,
                                        'expected evidence for file ' + fileEvidence.file + ' in: ' + details?.fileEvidences.map(f => f.full_path)
                                    );
                                    assert.equal(fileIssue?.locations.length, fileEvidence.locations.length);
                                });

                                it('Check evidences in all locations exists', () => {
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
            }
        });
    });

    testCases.forEach(test => {
        describe('Populate Applicable Issues - ' + test.name, () => {
            let testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
            let testDescriptor: DescriptorTreeNode = new DescriptorTreeNode('path', PackageType.Unknown, testRoot);
            let testDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '9.9.9', testDescriptor);
            let scanResult: DependencyScanResults;
            let cves: CveTreeNode[] = [];

            before(() => {
                // Prepare
                for (let cve of test.expectedCves) {
                    cves.push(createDummyCveIssue(Severity.Medium, testDependency, cve, cve));
                }
                scanResult = {
                    applicableScanTimestamp: 1,
                    applicableIssues: getDummyRunner().generateResponse(getAnalyzerScanRun(test.file))
                } as DependencyScanResults;
                // Run
                let issuePopulated: number = AnalyzerUtils.populateApplicableIssues(testRoot, testDescriptor, scanResult);

                it('Check issue count returned from method', () => {
                    assert.equal(issuePopulated, test.expectedIssueCount);
                });
            });

            it('Check timestamp transferred from data to node', () => {
                assert.equal(scanResult.applicableScanTimestamp, testDescriptor.applicableScanTimeStamp);
            });

            describe('Check Not applicable Cve data transfer', () => {
                let notApplicable: string[] = Array.from(testDescriptor.scannedCve ?? []).filter(cve => !testDescriptor.applicableCve?.has(cve));
                notApplicable.forEach(cve => {
                    describe('Check not applicable Cve - ' + cve, () => {
                        let node: CveTreeNode | undefined;

                        before(() => {
                            cves.find(cveItem => cveItem.issueId === cve);
                        });

                        it('Check node exists in scannedCve and not in applicableCve', () => {
                            assert.isDefined(node);
                        });

                        it('Check Cve marked as not applicable', () => {
                            assert.isFalse(node?.applicableDetails?.isApplicable);
                        });

                        it('Check Severity changed to not applicable level', () => {
                            assert.equal(node?.severity, Severity.NotApplicableMedium);
                        });
                    });
                });
            });

            describe('Check applicable issues populated', () => {
                for (let cveIssue of test.expectedEvidence) {
                    for (let fileEvidence of cveIssue.files) {
                        let filePath: string = AnalyzerUtils.parseLocationFilePath(fileEvidence.file);
                        describe('Check evidences in file ' + filePath, () => {
                            let codeFileNode: CodeFileTreeNode;

                            before(() => {
                                let fileNode: FileTreeNode | undefined = testRoot.getFileTreeNode(filePath);
                                it('Check file node created', () => {
                                    assert.isDefined(fileNode);
                                    if (!(fileNode instanceof CodeFileTreeNode)) {
                                        assert.fail('expected node to be CodeFileTreeNode for file ' + filePath + ', node: ' + fileNode);
                                    }
                                });
                                codeFileNode = <CodeFileTreeNode>fileNode;
                            });

                            it('Check number of evidences in file', () => {
                                assert.equal(codeFileNode.issues.length, fileEvidence.locations.length);
                            });

                            for (let location of fileEvidence.locations) {
                                describe('Check evidence location' + location.text, () => {
                                    let applicableIssue: ApplicableTreeNode;

                                    before(() => {
                                        let issueLocation: CodeIssueTreeNode | undefined = codeFileNode.issues.find(
                                            issue =>
                                                // Location in vscode start from 0, in scanners location starts from 1
                                                issue.regionWithIssue.start.line === location.location[0] - 1 &&
                                                issue.regionWithIssue.end.line === location.location[1] - 1 &&
                                                issue.regionWithIssue.start.character === location.location[2] - 1 &&
                                                issue.regionWithIssue.end.character === location.location[3] - 1
                                        );
                                        it('Check applicable location node created', () => {
                                            assert.isDefined(issueLocation);
                                            if (!(issueLocation instanceof ApplicableTreeNode)) {
                                                assert.fail(
                                                    'expected node to be ApplicableTreeNode for ' + location.location + ', node: ' + issueLocation
                                                );
                                            }
                                        });
                                        applicableIssue = <ApplicableTreeNode>issueLocation;
                                    });

                                    it('Check Cve node reference exists', () => {
                                        assert.equal(applicableIssue.cveNode.issueId, cveIssue.cve);
                                    });

                                    it('Check location Cve node marked as applicable', () => {
                                        assert.isTrue(applicableIssue.cveNode.applicableDetails?.isApplicable);
                                    });

                                    it('Check applicable information reference created in descriptor', () => {
                                        assert.isDefined(testDescriptor.applicableCve?.get(applicableIssue.issueId));
                                    });

                                    it('Check location node severity', () => {
                                        assert.equal(applicableIssue.severity, applicableIssue.cveNode.severity);
                                    });
                                });
                            }
                        });
                    }
                }
            });
        });
    });

    function getDummyRunner(): ApplicabilityRunner {
        return new ApplicabilityRunner({} as ConnectionManager, ScanUtils.ANALYZER_TIMEOUT_MILLISECS, logManager);
    }

    function getAnalyzerScanRun(filePath: string | undefined): AnalyzerScanRun | undefined {
        if (!filePath || !fs.existsSync(filePath)) {
            return undefined;
        }
        let result: AnalyzerScanResponse = JSON.parse(fs.readFileSync(filePath, 'utf8').toString());
        return result.runs[0];
    }
});
