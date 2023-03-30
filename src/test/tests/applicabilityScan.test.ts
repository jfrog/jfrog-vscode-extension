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
            let expected: string = 'scans:\n' + '  - type: ' + request.type + '\n' + '    output: ' + request.output + '\n';
            expected += '    roots:\n';
            for (let root of test.roots) {
                expected += '      - ' + root + '\n';
            }
            expected += '    cve-whitelist:\n';
            for (let cve of test.cves) {
                expected += '      - ' + cve + '\n';
            }
            expected += '    skipped-folders:' + (test.skip.length === 0 ? ' []' : '') + '\n';
            for (let skip of test.skip) {
                expected += '      - ' + skip + '\n';
            }

            assert.deepEqual(getDummyRunner().requestsToYaml(request), expected);
        });
    });

    let testCases: any [] = [
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
        it('Generate response - ' + test.name, () => {
            let response: ApplicabilityScanResponse = getDummyRunner().generateResponse(getAnalyzerScanRun(test.file));
            assert.isDefined(response);
            if (test.file) {
                assert.isDefined(response.scannedCve);
                assert.sameDeepMembers(test.expectedCves, response.scannedCve);
                assert.isDefined(response.applicableCve);
                let applicableCve: Map<string, CveApplicableDetails> = new Map<string, CveApplicableDetails>(Object.entries(response.applicableCve));
                assert.equal(applicableCve.size, test.expectedEvidence.length);
                for (let evidence of test.expectedEvidence) {
                    let details: CveApplicableDetails | undefined = applicableCve.get(evidence.cve);
                    assert.isDefined(details, 'expected evidence for ' + evidence.cve + ' in: ' + Array.from(applicableCve.keys()));
                    assert.equal(details?.fixReason, evidence.reason);
                    assert.include(details?.fullDescription, evidence.descriptionPartial);
                    assert.equal(details?.fileEvidences.length, evidence.files.length);
                    for (let fileEvidence of evidence.files) {
                        let fileIssue: FileIssues | undefined = details?.fileEvidences.find(fileIssue => fileIssue.full_path === fileEvidence.file);
                        assert.isDefined(
                            fileIssue,
                            'expected evidence for file ' + fileEvidence.file + ' in: ' + details?.fileEvidences.map(f => f.full_path)
                        );
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
                            assert.isDefined(location);
                        }
                    }
                }
            } else {
                assert.isUndefined(response.scannedCve);
                assert.isUndefined(response.applicableCve);
            }
        });
    });

    
    testCases.forEach(test => {
        it('Populate Applicable Issues - ' + test.name, async () => {
            let testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
            let testDescriptor: DescriptorTreeNode = new DescriptorTreeNode('path', PackageType.Unknown, testRoot);
            let testDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '9.9.9', testDescriptor);
            let cves: CveTreeNode[] = [];
            for (let cve of test.expectedCves) {
                cves.push(createDummyCveIssue(Severity.Unknown, testDependency, cve, cve));
            }
            let scanResult: DependencyScanResults = {
                applicableScanTimestamp: 1,
                applicableIssues: getDummyRunner().generateResponse(getAnalyzerScanRun(test.file))
            } as DependencyScanResults;

            assert.equal(AnalyzerUtils.populateApplicableIssues(testRoot,testDescriptor,scanResult), test.expectedIssueCount);
            assert.equal(scanResult.applicableScanTimestamp, testDescriptor.applicableScanTimeStamp);
            
            assert.lengthOf(testRoot.children, test.expectedTotalIssueCount + test.expectedCves.length);
            for (let cveIssue of test.expectedEvidence) {
                for (let fileEvidence of cveIssue.files) {
                    let fileNode: FileTreeNode | undefined = testRoot.getFileTreeNode(fileEvidence.file);
                    if (!(fileNode instanceof CodeFileTreeNode)) {
                        assert.fail('expected node to be CodeFileTreeNode, node: ' + fileNode);
                    }
                    let codeFileNode: CodeFileTreeNode = <CodeFileTreeNode> fileNode;
                    assert.equal(codeFileNode.issues.length, fileEvidence.locations.length);
                    for (let location of fileEvidence.locations) {
                        let issueLocation: CodeIssueTreeNode | undefined = codeFileNode.issues.find(issue => issue.regionWithIssue.start.line === location[0] && issue.regionWithIssue.end.line === location[1] && issue.regionWithIssue.start.character === location[2] && issue.regionWithIssue.end.character === location[3])
                        if (!(issueLocation instanceof ApplicableTreeNode)) {
                            assert.fail('expected node to be ApplicableTreeNode, node: ' + issueLocation);
                        }
                        // TODO finish tests
                    }
                }
            }
            // TODO: for not applicable -> change severity
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
