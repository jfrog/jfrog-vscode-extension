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

    before(async function () {
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

        // Run
        const response: SecretsScanResponse = await runner
            .executeRequest(() => undefined, { roots: [testDataRoot] } as AnalyzeScanRequest)
            .then(runResult => runner.convertResponse(runResult));

        // Assert
        assert.isUndefined(response.filesWithIssues);
    });

    it('Should download the analyzer  manager from releases-proxy instead of direct releases.jfrog.io', async () => {
        process.env[Configuration.JFROG_IDE_RELEASES_REPO_ENV] = 'releases-proxy';
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
