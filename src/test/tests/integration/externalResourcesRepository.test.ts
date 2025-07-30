import { assert } from 'chai';
import fs from 'fs-extra';

import * as path from 'path';

import { AnalyzeScanRequest } from '../../../main/scanLogic/scanRunners/analyzerModels';
import { SecretsRunner, SecretsScanResponse } from '../../../main/scanLogic/scanRunners/secretsScan';
import { AnalyzerManagerIntegrationEnv } from '../utils/testIntegration.test';
import { Configuration } from '../../../main/utils/configuration';
import { AnalyzerManager } from '../../../main/scanLogic/scanRunners/analyzerManager';

describe('External Resources Repository Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'secretsScan');

    before(async function() {
        fs.removeSync(path.dirname(AnalyzerManager.ANALYZER_MANAGER_PATH));
    });

    after(() => {
        delete process.env[Configuration.JFROG_IDE_RELEASES_REPO_ENV];
    });

    it('Should fail to download the analyzer manager from none existing repository', async () => {
        process.env[Configuration.JFROG_IDE_RELEASES_REPO_ENV] = 'none-existing-releases-proxy';
        // Prepare
        await integrationManager.initialize(testDataRoot);
        const runner: SecretsRunner = integrationManager.entitledJasRunnerFactory.createSecretsRunners()[0];
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        const expectedContent: any = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected SecretsScanResponse content from ' + dataPath);

        // Run and Assert
        try {
            await runner.executeRequest(() => undefined, { roots: [testDataRoot] } as AnalyzeScanRequest);
            assert.fail('Should throw error when executing runner and analyzer manager not downloaded');
        } catch (error) {
            assert.instanceOf(error, Error);
            assert.isDefined(error);
        }
    });

    it('Should download the analyzer manager from air-gap-vs-code instead of direct releases.jfrog.io', async () => {
        process.env[Configuration.JFROG_IDE_RELEASES_REPO_ENV] = 'air-gap-vs-code';
        process.env[Configuration.JFROG_IDE_CUSTOM_AM_VERSION] = '1.17.1'// This is the version we use in the test resources.
        // Prepare
        await integrationManager.initialize(testDataRoot);
        const runner: SecretsRunner = integrationManager.entitledJasRunnerFactory.createSecretsRunners()[0];
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        const expectedContent: any = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected SecretsScanResponse content from ' + dataPath);

        // Run
        const response: SecretsScanResponse = await runner
            .executeRequest(() => undefined, { roots: [testDataRoot] } as AnalyzeScanRequest)
            .then(runResult => runner.convertResponse(runResult));

        // Assert
        assert.isDefined(response.filesWithIssues);
    });
});
