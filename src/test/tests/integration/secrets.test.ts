import { assert } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
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

    before(async function() {
        // Integration initialization
        await integrationManager.initialize(testDataRoot);
        runner = integrationManager.entitledJasRunnerFactory.createSecretsRunners()[0];
        let directoryToScan: string = testDataRoot;
        if (os.platform() === 'win32') {
            // make the first char uppercase
            directoryToScan = directoryToScan.charAt(0).toUpperCase() + directoryToScan.slice(1);
        }
        runScanAndAssert(directoryToScan);
    });

    async function runScanAndAssert(directoryToScan: string) {
        describe('Run tests in ' + directoryToScan + ' workspace for secrets issues', () => {
            before(async () => {
                // Get expected partial result that the scan should contain
                let dataPath: string = path.join(directoryToScan, 'expectedScanResponse.json');
                expectedContent = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
                assert.isDefined(expectedContent, 'Failed to read expected SecretsScanResponse content from ' + dataPath);
                // Run scan
                // Try/Catch (with skip) should be removed after Secrets scan is released
                response = await runner
                    .executeRequest(() => undefined, { roots: [directoryToScan] } as AnalyzeScanRequest)
                    .then(runResult => runner.convertResponse(runResult));
            });

            it('Check response defined', () => {
                assert.isDefined(response);
            });

            it('Check response attributes defined', () => {
                assert.isDefined(response.filesWithIssues);
            });

            it('Check all expected files with issues detected', () =>
                assertFileIssuesExist(directoryToScan, response.filesWithIssues, expectedContent.filesWithIssues));

            it('Check all expected issues detected', () =>
                assertIssuesExist(directoryToScan, response.filesWithIssues, expectedContent.filesWithIssues));

            it('Check all expected locations detected', () =>
                assertIssuesLocationsExist(directoryToScan, response.filesWithIssues, expectedContent.filesWithIssues));

            it('Check calculateNumberOfTasks detected', () =>
                assert.equal(
                    ScanManager.calculateNumberOfTasks(
                        integrationManager.entitledJasRunnerFactory.createSecretsRunners(),
                        new Map<PackageType, Uri[]>()
                    ),
                    1
                ));

            describe('Detected issues validations', () => {
                it('Check rule-name', () => assertIssuesRuleNameExist(directoryToScan, response.filesWithIssues, expectedContent.filesWithIssues));

                it('Check rule full description', () =>
                    assertIssuesFullDescriptionExist(directoryToScan, response.filesWithIssues, expectedContent.filesWithIssues));

                it('Check severity', () => assertIssuesSeverityExist(directoryToScan, response.filesWithIssues, expectedContent.filesWithIssues));

                it('Check snippet', () =>
                    assertIssuesLocationSnippetsExist(directoryToScan, response.filesWithIssues, expectedContent.filesWithIssues));
            });
        });
    }
});
