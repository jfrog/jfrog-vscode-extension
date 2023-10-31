import { assert } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

import { AnalyzeScanRequest } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { SecretsRunner, SecretsScanResponse } from '../../../main/scanLogic/scanRunners/secretsScan';
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
import { PackageType } from '../../../main/types/projectType';
import { Uri } from 'vscode';

describe('Secrets Scan Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'secretsScan');

    let runner: SecretsRunner;
    let response: SecretsScanResponse;
    let expectedContent: SecretsScanResponse;

    before(async function () {
        // Integration initialization
        await integrationManager.initialize(testDataRoot);
        runner = integrationManager.entitledJasRunnerFactory.createSecretsRunners()[0];

        // Get expected partial result that the scan should contain
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        expectedContent = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected SecretsScanResponse content from ' + dataPath);
        // Run scan
        // Try/Catch (with skip) should be removed after Secrets scan is released
        response = await runner
            .executeRequest(() => undefined, { roots: [testDataRoot] } as AnalyzeScanRequest)
            .then(runResult => runner.convertResponse(runResult));
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

    it('Check calculateNumberOfTasks detected', () =>
        assert.equal(ScanManager.calculateNumberOfTasks(integrationManager.entitledJasRunnerFactory.createSecretsRunners(), new Map<PackageType, Uri[]>()), 1))

    describe('Detected issues validations', () => {
        it('Check rule-name', () => assertIssuesRuleNameExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check rule full description', () =>
            assertIssuesFullDescriptionExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check severity', () => assertIssuesSeverityExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));

        it('Check snippet', () => assertIssuesLocationSnippetsExist(testDataRoot, response.filesWithIssues, expectedContent.filesWithIssues));
    });
});
