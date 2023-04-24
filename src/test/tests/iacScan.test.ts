import { assert } from 'chai';
import { ConnectionManager } from "../../main/connect/connectionManager";
import { LogManager } from "../../main/log/logManager";
import { IacRunner, IacScanResponse } from "../../main/scanLogic/scanRunners/iacScan";
import { ScanUtils } from "../../main/utils/scanUtils";

describe('Iac Scan Tests', () => {
    let logManager: LogManager = new LogManager().activate();

    describe('Iac scan fails', () => {
        let response: IacScanResponse;

        before(() => {
            response = getDummyRunner().generateScanResponse(undefined);
        });

        it('Check response defined', () => {
            assert.isDefined(response);
        });

        it('Check response attributes are not exist', () => {
            assert.isUndefined(response.filesWithIssues);
        });
    });

    describe('Populate Iac information tests', () => {
        const testRoot: IssuesRootTreeNode = createRootTestNode(path.join('root'));
        let scanResult: DependencyScanResults;
        let populatedIssues: number;

        before(() => {
            // Read test data and populate scanResult and dummy Cve nodes in test dependency
            let response: ApplicabilityScanResponse = getDummyRunner().generateResponse(
                getAnalyzerScanResponse(path.join(scanApplicable, 'analyzerResponse.json'))?.runs[0]
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
        }
    });

    function getDummyRunner(): IacRunner {
        return new IacRunner({} as ConnectionManager, ScanUtils.ANALYZER_TIMEOUT_MILLISECS, logManager);
    }
});
