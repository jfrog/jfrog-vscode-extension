import { assert } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

import { AnalyzeScanRequest } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { IacRunner, IacScanResponse } from '../../../main/scanLogic/scanRunners/iacScan';
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
import { ScanManager } from '../../../main/scanLogic/scanManager';
import { Uri } from 'vscode';
import { PackageType } from '../../../main/types/projectType';

describe('Iac Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'iacScan');

    let runner: IacRunner;
    let response: IacScanResponse;
    let expectedContent: IacScanResponse;

    before(async function() {
        // Integration initialization
        await integrationManager.initialize();
        runner = integrationManager.entitledJasRunnerFactory.createIacRunners()[0];

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

    it('Check calculateNumberOfTasks detected', () => assert.equal(ScanManager.calculateNumberOfTasks([runner], getDummyDescriptors()), 4));

    describe('Detected issues validations', () => {
        it('Check rule-name', () => assertIssuesRuleNameExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check rule full description', () =>
            assertIssuesFullDescriptionExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check severity', () => assertIssuesSeverityExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check snippet', () => assertIssuesLocationSnippetsExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));
    });
});

function getDummyDescriptors(): Map<PackageType, Uri[]> {
    let descriptors: Map<PackageType, Uri[]> = new Map<PackageType, Uri[]>();
    descriptors.set(PackageType.Go, [Uri.parse('/somewhere/file'), Uri.parse('/somewhere/other')]);
    descriptors.set(PackageType.Npm, [Uri.parse('/somewhere/other')]);
    return descriptors;
}
