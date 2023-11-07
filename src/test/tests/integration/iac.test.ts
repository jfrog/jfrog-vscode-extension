import { assert } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

import { AnalyzeScanRequest } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { IacRunner, IacScanResponse } from '../../../main/scanLogic/scanRunners/iacScan';
import { ScanResults } from '../../../main/types/workspaceIssuesDetails';
import { AppsConfigModule } from '../../../main/utils/jfrogAppsConfig/jfrogAppsConfig';
import {
    AnalyzerManagerIntegrationEnv,
    assertFileIssuesExist,
    assertIssuesExist,
    assertIssuesFullDescriptionExist,
    assertIssuesLocationSnippetsExist,
    assertIssuesLocationsExist,
    assertIssuesRuleNameExist,
    assertIssuesSeverityExist
} from '../utils/testIntegration.test';
import { createRootTestNode } from '../utils/treeNodeUtils.test';
import { createTestStepProgress } from '../utils/utils.test';

describe('Iac Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'iacScan');

    let runner: IacRunner;
    let response: IacScanResponse;
    let expectedContent: IacScanResponse;

    before(async function() {
        // Integration initialization
        await integrationManager.initialize();
        runner = new IacRunner(
            {} as ScanResults,
            createRootTestNode(''),
            createTestStepProgress(),
            integrationManager.connectionManager,
            integrationManager.logManager,
            new AppsConfigModule(testDataRoot),
            integrationManager.resource
        );
        runner.verbose = true;
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
        // Get expected partial result that the scan should contain
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        expectedContent = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected IacScanResponse content from ' + dataPath);
        // Run scan
        // Try/Catch (with skip) should be removed after Iac is released
        response = await runner
            .executeRequest(() => undefined, { roots: [testDataRoot] } as AnalyzeScanRequest)
            .then(runResult => runner.generateScanResponse(runResult));
    });

    it('Check response defined', () => {
        assert.isDefined(response);
    });

    it('Check response attributes defined', () => {
        assert.isDefined(response.filesWithIssues);
    });

    it('Check all expected files with issues detected', () =>
        assertFileIssuesExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

    it('Check all expected issues detected', () => assertIssuesExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

    it('Check all expected locations detected', () =>
        assertIssuesLocationsExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

    describe('Detected issues validations', () => {
        it('Check rule-name', () => assertIssuesRuleNameExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check rule full description', () =>
            assertIssuesFullDescriptionExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check severity', () => assertIssuesSeverityExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check snippet', () => assertIssuesLocationSnippetsExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));
    });
});
