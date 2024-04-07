import { assert } from 'chai';
import { LogManager } from '../../../main/log/logManager';
import { ScanManager } from '../../../main/scanLogic/scanManager';
import { SupportedScans } from '../../../main/scanLogic/sourceCodeScan/supportedScans';
import { IssuesRootTreeNode } from '../../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { ScanResults } from '../../../main/types/workspaceIssuesDetails';
import { WorkspaceScanDetails } from '../../../main/types/workspaceScanDetails';
import { BaseIntegrationEnv } from '../utils/testIntegration.test';
import { createTestStepProgress } from '../utils/utils.test';
import { ConnectionUtils } from '../../../main/connect/connectionUtils';

describe('XSC Integration Tests', async () => {
    const integrationManager: BaseIntegrationEnv = new BaseIntegrationEnv();
    let logManager: LogManager = new LogManager().activate();
    let scanManager: ScanManager;
    let supportedScans: SupportedScans;

    before(async function() {
        // Integration initialization
        await integrationManager.initialize();
        if ((await ConnectionUtils.testXscVersion(integrationManager.connectionManager.createJfrogClient())) === '') {
            this.skip();
        }
        scanManager = new ScanManager(integrationManager.connectionManager, logManager);
        supportedScans = await new SupportedScans(integrationManager.connectionManager, logManager).getSupportedScans();
    });

    it('Test send analytics log event', async () => {
        await integrationManager.connectionManager.logWithAnalytics('VSCode XSC integration test', 'DEBUG');
    });

    it('Test send analytics Scan event', async () => {
        let scanDetails: WorkspaceScanDetails = new WorkspaceScanDetails(
            scanManager,
            supportedScans,
            new ScanResults('some-path'),
            new IssuesRootTreeNode({ uri: 'some-uri' } as any),
            createTestStepProgress()
        );

        assert.isUndefined(scanDetails.multiScanId);

        await scanDetails.startScan();

        assert.isDefined(scanDetails.multiScanId);

        await scanDetails.endScan();
    });
});
