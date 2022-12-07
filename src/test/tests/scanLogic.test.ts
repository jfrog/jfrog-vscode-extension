import { assert } from 'chai';
import * as fs from 'fs';
import { ComponentDetails /*, IArtifact*/, IGraphResponse /*, ISummaryResponse*/ } from 'jfrog-client-js';
import * as path from 'path';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { AbstractScanLogic } from '../../main/scanLogic/abstractScanLogic';
// import { ComponentSummaryScanLogic } from '../../main/scanLogic/componentSummaryScanLogic';
import { GraphScanLogic } from '../../main/scanLogic/graphScanLogic';
import { ILicenseKey } from '../../main/types/licenseKey';
import { INodeInfo } from '../../main/types/nodeInfo';
import { ProjectComponents } from '../../main/types/projectComponents';
import { Severity } from '../../main/types/severity';
import { createScanCacheManager } from './utils/utils.test';

describe('Scan Logic Tests', () => {
    const scanResponses: string = path.join(__dirname, '..', 'resources', 'scanResponses');

    // it('component/summary', async () => {
    //     let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();
    //     let dummyConnectionManager: ConnectionManager = createComponentSummaryConnectionManager();
    //     let scanLogic: ComponentSummaryScanLogic = new ComponentSummaryScanLogic(dummyConnectionManager, dummyScanCacheManager);
    //     await testScanLogic(dummyScanCacheManager, scanLogic, false);
    // });

    it('scan/graph vulnerabilities', async () => {
        let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();
        let dummyConnectionManager: ConnectionManager = createScanGraphConnectionManager('graphScanVulnerabilities');
        let scanLogic: GraphScanLogic = new GraphScanLogic(dummyConnectionManager, dummyScanCacheManager);
        await testScanLogic(dummyScanCacheManager, scanLogic, false);
    });

    it('scan/graph violations', async () => {
        let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();
        let dummyConnectionManager: ConnectionManager = createScanGraphConnectionManager('graphScanViolations');
        let scanLogic: GraphScanLogic = new GraphScanLogic(dummyConnectionManager, dummyScanCacheManager);
        await testScanLogic(dummyScanCacheManager, scanLogic, true);
    });

    async function testScanLogic(scanCacheManager: ScanCacheManager, scanLogic: AbstractScanLogic, licenseViolated: boolean) {
        let componentsToScan: Set<ComponentDetails> = new Set<ComponentDetails>(component => component.component_id);
        componentsToScan.add({ component_id: 'gav://io.netty:netty-codec-http:4.1.31.Final' });
        componentsToScan.add({ component_id: 'gav://org.apache.commons:commons-lang3:3.12.0' });
        componentsToScan.add({ component_id: 'gav://commons-io:commons-io:2.11.0' });
        await scanLogic.scanAndCache(
            { report: () => false } as vscode.Progress<{ message?: string; increment?: number }>,
            componentsToScan,
            { componentIdToCve: new Map() } as ProjectComponents,
            () => false
        );

        // netty-codec-http should contain 8 issues and 1 license returned from Xray
        let nodeInfo: INodeInfo | undefined = scanCacheManager.getNodeInfo('io.netty:netty-codec-http:4.1.31.Final');
        assert.isDefined(nodeInfo);
        if (nodeInfo) {
            assert.equal(nodeInfo.top_severity, Severity.Critical);
            assert.lengthOf(nodeInfo.issues, 8);
            assert.lengthOf(nodeInfo.licenses, 1);
            assert.deepEqual(nodeInfo.licenses[0], { licenseName: 'Apache-2.0', violated: licenseViolated } as ILicenseKey);
        }

        // commons-lang3 should contain 0 issues and 1 license returned from Xray
        nodeInfo = scanCacheManager.getNodeInfo('org.apache.commons:commons-lang3:3.12.0');
        assert.isDefined(nodeInfo);
        if (nodeInfo) {
            assert.equal(nodeInfo.top_severity, Severity.Normal);
            assert.isEmpty(nodeInfo.issues);
            assert.lengthOf(nodeInfo.licenses, 1);
            assert.deepEqual(nodeInfo.licenses[0], { licenseName: 'Apache-2.0', violated: licenseViolated } as ILicenseKey);
        }

        // commons-io does not exist in Xray, but expected to exist in the cache to make sure it wouldn't scanned again
        nodeInfo = scanCacheManager.getNodeInfo('commons-io:commons-io:2.11.0');
        assert.isDefined(nodeInfo);
        if (nodeInfo) {
            /*if (scanLogic instanceof ComponentSummaryScanLogic) {
                assert.equal(nodeInfo.top_severity, Severity.Normal);
            } else {
                assert.equal(nodeInfo.top_severity, Severity.Unknown);
            }*/
            assert.equal(nodeInfo.top_severity, Severity.Unknown); // added because of comment
            assert.isEmpty(nodeInfo.issues);
            assert.isEmpty(nodeInfo.licenses);
        }
    }

    // function createComponentSummaryConnectionManager(): ConnectionManager {
    //     return {
    //         // eslint-disable-next-line @typescript-eslint/no-unused-vars
    //         async summaryComponent(componentDetails: ComponentDetails[]): Promise<IArtifact[]> {
    //             let graphResponse: string = fs.readFileSync(path.join(scanResponses, 'summaryComponent.json'), 'utf8');
    //             let response: ISummaryResponse = Object.assign({} as ISummaryResponse, JSON.parse(graphResponse));
    //             return response.artifacts;
    //         }
    //     } as ConnectionManager;
    // }

    function createScanGraphConnectionManager(type: string): ConnectionManager {
        return {
            async scanGraph(
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                componentsToScan: Set<ComponentDetails>,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                progress: vscode.Progress<{ message?: string; increment?: number }>,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                checkCanceled: () => void,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                project: string,
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                watches: string[]
            ): Promise<IGraphResponse> {
                let graphResponse: string = fs.readFileSync(path.join(scanResponses, type + '.json'), 'utf8');
                return Object.assign({} as IGraphResponse, JSON.parse(graphResponse));
            }
        } as ConnectionManager;
    }
});
