import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'chai';

import { IacFileIssues, IacRunner, IacScanResponse } from '../../../main/scanLogic/scanRunners/iacScan';
import { AnalyzerManagerIntegrationEnv } from '../utils/testIntegration.test';
import { ScanUtils } from '../../../main/utils/scanUtils';

describe('Iac Integration Tests', async () => {
    const integrationManager: AnalyzerManagerIntegrationEnv = new AnalyzerManagerIntegrationEnv();
    const testDataRoot: string = path.join(__dirname, '..', '..', 'resources', 'iacScan');

    let runner: IacRunner;
    let response: IacScanResponse;
    let expectedContent: IacScanResponse;

    before(async () => {
        // Integration initialization
        await integrationManager.initialize();
        runner = new IacRunner(
            integrationManager.connectionManager,
            ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            integrationManager.logManager,
            integrationManager.resource
        );
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
        // Get expected partial result that the scan should contain
        let dataPath: string = path.join(testDataRoot, 'expectedScanResponse.json');
        expectedContent = JSON.parse(fs.readFileSync(dataPath, 'utf8').toString());
        assert.isDefined(expectedContent, 'Failed to read expected IacScanResponse content from ' + dataPath);
        // Run scan
        response = await runner.scan(testDataRoot, () => undefined);
    });

    function getExpectedFilePath(fileName: string): string {
        return 'file://' + path.join(testDataRoot, fileName);
    }

    it('Check response defined', () => {
        assert.isDefined(response);
    });

    it('Check response attributes defined', () => {
        assert.isDefined(response.filesWithIssues);
    });

    it('Check all expected files with issues detected', () => {
        expectedContent.filesWithIssues.forEach((expectedFileWithIssues: IacFileIssues) => {
            assert.isDefined(
                response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === getExpectedFilePath(expectedFileWithIssues.full_path))
            );
        });
    });
});
