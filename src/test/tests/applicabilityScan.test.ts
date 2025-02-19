import { assert } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

import { IEvidence } from 'jfrog-ide-webview';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { AnalyzerScanResponse, FileIssues, FileRegion } from '../../main/scanLogic/scanRunners/analyzerModels';
import {
    ApplicabilityRunner,
    ApplicabilityScanArgs,
    ApplicabilityScanResponse,
    CveApplicableDetails
} from '../../main/scanLogic/scanRunners/applicabilityScan';
import { ApplicableTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/applicableTreeNode';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { CodeIssueTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeIssueTreeNode';
import { CveTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/cveTreeNode';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { DescriptorTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/descriptorTreeNode';
import { EnvironmentTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/environmentTreeNode';
import { ProjectDependencyTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils } from '../../main/treeDataProviders/utils/analyzerUtils';
import { PackageType } from '../../main/types/projectType';
import { Severity } from '../../main/types/severity';
import { DependencyScanResults, ScanResults } from '../../main/types/workspaceIssuesDetails';
import { FileScanBundle, ScanUtils } from '../../main/utils/scanUtils';
import { createDummyCveIssue, createDummyDependencyIssues, createRootTestNode, getTestCodeFileNode } from './utils/treeNodeUtils.test';
import { createTestStepProgress, getAnalyzerScanResponse, removeWindowsWhiteSpace } from './utils/utils.test';
import { AnalyzerManager } from '../../main/scanLogic/scanRunners/analyzerManager';

let logManager: LogManager = new LogManager().activate();
describe('Applicability Scan Tests', () => {
    const scanApplicable: string = path.join(__dirname, '..', 'resources', 'applicableScan');
    let tempFolder: string = ScanUtils.createTmpDir();

    [
        {
            name: 'One root',
            expectedYaml: path.join(scanApplicable, 'requestOneRoot.yaml'),
            roots: ['/path/to/root'],
            cves: ['CVE-2021-3918'],
            indirect_cves: ['CVE-2021-44228'],
            skip: []
        },
        {
            name: 'Multiple roots',
            expectedYaml: path.join(scanApplicable, 'requestMultipleRoots.yaml'),
            roots: ['/path/to/root', '/path/to/other'],
            cves: ['CVE-2021-3918', 'CVE-2021-3807', 'CVE-2022-25878'],
            indirect_cves: ['CVE-2021-44228', 'CVE-2023-1234'],
            skip: ['/path/to/skip']
        }
    ].forEach(test => {
        it('Check generated Yaml request for - ' + test.name, () => {
            let request: ApplicabilityScanArgs = getApplicabilityScanRequest(test.roots, test.cves, test.indirect_cves, test.skip);
            let actualYaml: string = path.join(tempFolder, test.name);
            fs.writeFileSync(actualYaml, getDummyRunner([], PackageType.Unknown).requestsToYaml(request));
            assert.deepEqual(
                fs.readFileSync(actualYaml, 'utf-8').toString(),
                removeWindowsWhiteSpace(fs.readFileSync(test.expectedYaml, 'utf-8').toString())
            );
        });
    });

    describe('Applicability scan fails', () => {
        let response: ApplicabilityScanResponse;

        before(() => {
            response = getDummyRunner([], PackageType.Unknown).convertResponse(undefined);
        });

        it('Check response defined', () => {
            assert.isDefined(response);
        });

        it('Check response attributes are not exist', () => {
            assert.isUndefined(response.scannedCve);
            assert.isUndefined(response.cvesWithApplicableStates);
        });
    });

    describe('Run applicability scan', () => {
        let npmApplicabilityRunner: DummyApplicabilityRunner;
        let pythonApplicabilityRunner: DummyApplicabilityRunner;
        const testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
        const testDescriptor: ProjectDependencyTreeNode = new EnvironmentTreeNode('path', PackageType.Unknown, testRoot);

        let expectedNpmScannedCve: string[] = ['CVE-2021-3807', 'CVE-2021-3918'];
        let expectedPythonScannedCve: string[] = ['CVE-2021-3807', 'CVE-2021-3918', 'CVE-2022-25878'];

        before(async () => {
            // Create dummy cve
            let testDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '9.9.9', testDescriptor);
            for (let cve of new Set<string>(expectedNpmScannedCve)) {
                createDummyCveIssue(Severity.Medium, testDependency, cve, cve);
            }
            let notDirectDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '8.8.8', testDescriptor, true);
            for (let cve of ['CVE-2022-25878']) {
                createDummyCveIssue(Severity.Medium, notDirectDependency, cve, cve);
            }
            // Create dummy bundle for tests
            let scanBundle: FileScanBundle = {
                workspaceResults: {} as ScanResults,
                rootNode: testRoot,
                data: { fullPath: 'some-path', applicableScanTimestamp: 1 } as DependencyScanResults,
                dataNode: testDescriptor
            } as FileScanBundle;

            // Run scan
            npmApplicabilityRunner = getDummyRunner([scanBundle], PackageType.Npm);
            await npmApplicabilityRunner.scan().catch(err => assert.fail(err));
            pythonApplicabilityRunner = getDummyRunner([scanBundle], PackageType.Python);
            await pythonApplicabilityRunner.scan().catch(err => assert.fail(err));
        });

        it('Check Virtual Environment is scanned', () => {
            assert.isTrue(pythonApplicabilityRunner.scanned);
        });

        it('Only scan direct cve', () => {
            npmApplicabilityRunner.cvesScanned.keys();
            assert.sameMembers(expectedNpmScannedCve, [...npmApplicabilityRunner.cvesScanned]);
        });
        // For Python projects, we scan all CVEs.
        it('All cve with python project', () => {
            pythonApplicabilityRunner.cvesScanned.keys();
            assert.sameMembers(expectedPythonScannedCve, [...pythonApplicabilityRunner.cvesScanned]);
        });
    });

    describe('Populate applicable information tests', () => {
        const testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
        const testDescriptor: DescriptorTreeNode = new DescriptorTreeNode('path', PackageType.Unknown, testRoot);
        const testDependency: DependencyIssuesTreeNode = createDummyDependencyIssues('dummy', '9.9.9', testDescriptor);
        let testCves: CveTreeNode[] = [];
        let scanResult: DependencyScanResults;
        let populatedIssues: number;

        before(() => {
            // Read test data and populate scanResult and dummy Cve nodes in test dependency
            let response: ApplicabilityScanResponse = getDummyRunner([], PackageType.Unknown).convertResponse(
                getAnalyzerScanResponse(path.join(scanApplicable, 'analyzerResponse.json'))
            );
            for (let cve of response.scannedCve) {
                testCves.push(createDummyCveIssue(Severity.Medium, testDependency, cve, cve));
            }
            scanResult = {
                applicableScanTimestamp: 1,
                applicableIssues: response
            } as DependencyScanResults;
            // Populate scan result information to the test dummy nodes
            populatedIssues = AnalyzerUtils.populateApplicableIssues(testRoot, testDescriptor, scanResult);
        });

        function getTestCveNode(cve: string): CveTreeNode | undefined {
            return testCves.find(cveItem => cveItem.issueId === cve);
        }

        it('Check issue count returned from method', () => {
            assert.equal(populatedIssues, 2);
        });

        it('Check timestamp transferred from data to node', () => {
            assert.equal(scanResult.applicableScanTimestamp, testDescriptor.applicableScanTimeStamp);
        });

        describe('Not applicable Cve tests', () => {
            let notApplicable: string[];
            const cveWithApplicableStates: Map<string,CveApplicableDetails> = new Map<string,CveApplicableDetails>(scanResult.applicableIssues ? Object.entries(scanResult.applicableIssues.cvesWithApplicableStates) : []);


            before(() => {
                notApplicable = Array.from(scanResult.applicableIssues.scannedCve ?? []).filter(cve => !cveWithApplicableStates?.has(cve));
            });

            it('Check node exists in scannedCve and not in applicableCve', () => {
                notApplicable.forEach((cve: string) => {
                    assert.isDefined(getTestCveNode(cve), 'Expected to find ' + cve + ' in ' + notApplicable);
                });
            });

            it('Check applicableDetails created for the Cve nodes', () => {
                notApplicable.forEach((cve: string) => {
                    assert.isDefined(getTestCveNode(cve)?.applicableDetails, 'Expected to find applicableDetails for ' + cve);
                });
            });

            it('Check Cve node marked as not applicable', () => {
                notApplicable.forEach((cve: string) => {
                    let node: CveTreeNode | undefined = getTestCveNode(cve);
                    assert.isFalse(node?.applicableDetails?.applicability, 'Cve node ' + cve + ' marked as ' + node?.applicableDetails?.applicability);
                });
            });

            it('Check Severity changed to not applicable level for related Cve node', () => {
                notApplicable.forEach((cve: string) => {
                    let node: CveTreeNode | undefined = getTestCveNode(cve);
                    assert.equal(node?.severity, Severity.NotApplicableMedium, 'Cve node ' + cve + ' severity ' + node?.severity);
                });
            });
        });

        describe('Applicable Cve tests', () => {
            let applicableCve: Map<string, CveApplicableDetails>;
            let expectedFilesWithIssues: FileIssues[] = [];

            before(() => {
                applicableCve = new Map<string, CveApplicableDetails>(Object.entries(scanResult.applicableIssues.cvesWithApplicableStates));
                // Collect all the locations from the test data with issues under the same file to be together under the same data
                Array.from(applicableCve.values()).forEach((details: CveApplicableDetails) => {
                    details.fileEvidences.forEach((fileEvidence: FileIssues) => {
                        let fileIssues: FileIssues | undefined = expectedFilesWithIssues.find(
                            (fileIssues: FileIssues) => fileIssues.full_path === fileEvidence.full_path
                        );
                        if (!fileIssues) {
                            expectedFilesWithIssues.push({
                                full_path: fileEvidence.full_path,
                                locations: [...fileEvidence.locations]
                            } as FileIssues);
                            return;
                        }
                        fileIssues.locations.push(...fileEvidence.locations);
                    });
                });
            });

            describe('Data transferred to Cve nodes', () => {
                it('Check applicableDetails created', () => {
                    Array.from(applicableCve.keys()).forEach((cve: string) => {
                        assert.isDefined(getTestCveNode(cve)?.applicableDetails, 'Expected to find applicableDetails for ' + cve);
                    });
                });

                it('Check Cve node marked as applicable', () => {
                    Array.from(applicableCve.keys()).forEach((cve: string) => {
                        let node: CveTreeNode | undefined = getTestCveNode(cve);
                        assert.isTrue(
                            node?.applicableDetails?.applicability,
                            'Cve node ' + cve + ' marked as ' + node?.applicableDetails?.applicability
                        );
                    });
                });

                it('Check description transferred to applicableDetails', () => {
                    applicableCve.forEach((details: CveApplicableDetails, cve: string) => {
                        let node: CveTreeNode | undefined = getTestCveNode(cve);
                        assert.equal(node?.applicableDetails?.searchTarget, details.fullDescription);
                    });
                });

                it('Check evidences created at applicableDetails', () => {
                    applicableCve.forEach((details: CveApplicableDetails, cve: string) => {
                        let relatedEvidence: IEvidence[] | undefined = getTestCveNode(cve)?.applicableDetails?.evidence;
                        assert.isDefined(relatedEvidence);
                        let expectedEvidenceCount: number = details.fileEvidences
                            .map((fileEvidence: FileIssues) => fileEvidence.locations.length)
                            .reduce((agg, prev) => agg + prev);
                        assert.equal(relatedEvidence?.length ?? 0, expectedEvidenceCount);
                    });
                });

                it('Check reason transferred to evidences', () => {
                    applicableCve.forEach((details: CveApplicableDetails, cve: string) => {
                        let relatedEvidence: IEvidence[] | undefined = getTestCveNode(cve)?.applicableDetails?.evidence;
                        relatedEvidence?.forEach((evidence: IEvidence) => assert.equal(evidence.reason, details.fixReason));
                    });
                });
            });

            describe('Data populated as CodeFileTreeNode nodes', () => {
                it('Check file nodes created for each file with issues', () => {
                    expectedFilesWithIssues.forEach((fileIssues: FileIssues) => {
                        assert.isDefined(getTestCodeFileNode(testRoot, fileIssues.full_path));
                    });
                });

                it('Check number of file nodes populated as root children', () => {
                    assert.equal(
                        testRoot.children.length,
                        expectedFilesWithIssues.length,
                        'files populated: ' + testRoot.children.map(child => child.label)
                    );
                });

                describe('Issues populated as ApplicableTreeNode nodes', () => {
                    function getTestIssueNode(fileNode: CodeFileTreeNode, location: FileRegion): ApplicableTreeNode {
                        let issueLocation: CodeIssueTreeNode | undefined = fileNode.issues.find(
                            issue =>
                                // Location in vscode start from 0, in scanners location starts from 1
                                issue.regionWithIssue.start.line === location.startLine - 1 &&
                                issue.regionWithIssue.end.line === location.endLine - 1 &&
                                issue.regionWithIssue.start.character === location.startColumn - 1 &&
                                issue.regionWithIssue.end.character === location.endColumn - 1
                        );
                        if (!(issueLocation instanceof ApplicableTreeNode)) {
                            assert.fail('expected node to be ApplicableTreeNode issue for location ' + location + ' in node: ' + issueLocation);
                        }
                        return <ApplicableTreeNode>issueLocation;
                    }

                    it('Check Applicable location nodes created in file nodes', () => {
                        expectedFilesWithIssues.forEach((expectedFileIssues: FileIssues) => {
                            let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                            expectedFileIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.isDefined(getTestIssueNode(fileNode, expectedLocation));
                            });
                        });
                    });

                    it('Check number of issues populated in file', () => {
                        expectedFilesWithIssues.forEach((fileIssues: FileIssues) => {
                            let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, fileIssues.full_path);
                            assert.equal(fileNode.issues.length, fileIssues.locations.length);
                        });
                    });

                    it('Check applicable information reference created in descriptor', () => {
                        const cveWithApplicableStates: Map<string,CveApplicableDetails> = new Map<string,CveApplicableDetails>(scanResult.applicableIssues ? Object.entries(scanResult.applicableIssues.cvesWithApplicableStates) : []);

                        expectedFilesWithIssues.forEach((expectedFileIssues: FileIssues) => {
                            let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                            expectedFileIssues.locations.forEach((expectedLocation: FileRegion) => {
                                assert.isDefined(cveWithApplicableStates.get(getTestIssueNode(fileNode, expectedLocation).issueId));
                            });
                        });
                    });

                    it('Check ApplicableTreeNode node severity match Cve severity', () => {
                        expectedFilesWithIssues.forEach((expectedFileIssues: FileIssues) => {
                            let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                            expectedFileIssues.locations.forEach((expectedLocation: FileRegion) => {
                                let applicableIssue: ApplicableTreeNode = getTestIssueNode(fileNode, expectedLocation);
                                assert.equal(applicableIssue.severity, applicableIssue.cveNode.severity);
                            });
                        });
                    });

                    it('Check Cve node reference exists', () => {
                        expectedFilesWithIssues.forEach((expectedFileIssues: FileIssues) => {
                            let fileNode: CodeFileTreeNode = getTestCodeFileNode(testRoot, expectedFileIssues.full_path);
                            expectedFileIssues.locations.forEach((expectedLocation: FileRegion) => {
                                let applicableIssue: ApplicableTreeNode = getTestIssueNode(fileNode, expectedLocation);
                                assert.isDefined(getTestCveNode(applicableIssue.cveNode.issueId));
                            });
                        });
                    });
                });
            });
        });
    });

    function getApplicabilityScanRequest(roots: string[], cves: string[], indirect_cves: string[], skipFolders: string[]): ApplicabilityScanArgs {
        return {
            type: 'analyze-applicability',
            output: '/path/to/output.json',
            roots: roots,
            cve_whitelist: cves,
            indirect_cve_whitelist: indirect_cves,
            skipped_folders: skipFolders
        } as ApplicabilityScanArgs;
    }

    function getDummyRunner(scanBundles: FileScanBundle[], packageType: PackageType): DummyApplicabilityRunner {
        return new DummyApplicabilityRunner(scanBundles, packageType);
    }
});

class DummyApplicabilityRunner extends ApplicabilityRunner {
    cvesScanned: Set<string> = new Set<string>();
    scanned: boolean = false;

    constructor(scanBundles: FileScanBundle[], packageType: PackageType) {
        super(scanBundles, packageType, createTestStepProgress(), {} as ConnectionManager, logManager, {} as AnalyzerManager);
    }

    /** @override */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public executeRequest(checkCancel: () => void, request: ApplicabilityScanArgs): Promise<AnalyzerScanResponse | undefined> {
        this.scanned = true;
        this.cvesScanned = new Set<string>(request.cve_whitelist);

        return new Promise<AnalyzerScanResponse | undefined>(resolve => {
            resolve(undefined);
        });
    }
}
