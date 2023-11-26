import { assert } from 'chai';
import * as path from 'path';
import { AnalyzerManagerIntegrationEnv } from '../utils/testIntegration.test';
import { JasRunner } from '../../../main/scanLogic/scanRunners/jasRunner';

describe('Jas Runner Factory', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'secretsScan');

    before(async function() {
        // Integration initialization
        await integrationManager.initialize(testDataRoot);
    });

    it('Should create config source root for each jas runner', async () => {
        const runner: JasRunner[] = await integrationManager.entitledJasRunnerFactory.createJasRunner();
        runner.forEach(runner => {
            assert.equal(testDataRoot, runner.config.sourceRoot);
        });
    });
});
