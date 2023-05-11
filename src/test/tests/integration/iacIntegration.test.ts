import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';

import { IacRunner, IacScanResponse } from '../../../main/scanLogic/scanRunners/iacScan';
import { AnalyzerManagerIntegrationEnv, assertExpectedContentWithSecurityIssues } from '../utils/testIntegration.test';
import { NotSupportedError } from '../../../main/utils/scanUtils';

describe('Iac Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'iacScan');

    let runner: IacRunner;
    let response: IacScanResponse;
    let expectedContent: IacScanResponse;

    before(async function() {
        // Integration initialization
        await integrationManager.initialize();
        runner = new IacRunner(integrationManager.connectionManager, integrationManager.logManager, integrationManager.resource);
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
        // Get expected partial result that the scan should contain
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        expectedContent = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected IacScanResponse content from ' + dataPath);
        // Run scan
        // Try/Catch (with skip) should be removed after Iac is released
        try {
            response = await runner.scan(testDataRoot, () => undefined);
        } catch (err) {
            if (err instanceof NotSupportedError) {
                this.skip();
            }
            throw err;
        }

        assertExpectedContentWithSecurityIssues(testDataRoot, expectedContent, response);
    });
});
