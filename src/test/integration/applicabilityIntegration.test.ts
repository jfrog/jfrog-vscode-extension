import { assert } from 'chai';

import { ApplicabilityRunner } from '../../main/scanLogic/scanRunners/applicabilityScan';
import { ScanUtils } from '../../main/utils/scanUtils';
import { AnalyzerManagerIntegration } from './utils.test';

describe('Contextual Analysis Integration Tests', async () => {
    let integration: AnalyzerManagerIntegration = new AnalyzerManagerIntegration();
    let runner: ApplicabilityRunner;

    before(async () => {
        await integration.initialize();
        // Must be created after integration initialization
        runner = new ApplicabilityRunner(
            integration.connectionManager,
            ScanUtils.ANALYZER_TIMEOUT_MILLISECS,
            integration.logManager,
            integration.resource
        );
        assert.isTrue(runner.validateSupported(), "Can't find runner binary file in path: " + runner.binary.fullPath);
    });

    it('test', () => {
        //
    })
});
