import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ConnectionUtils } from '../connect/connectionUtils';
import { ExtensionComponent } from '../extensionComponent';
import { LogManager } from '../log/logManager';
import { ScanCacheManager } from '../scanCache/scanCacheManager';
import { AbstractScanLogic } from './abstractScanLogic';
import { ComponentSummaryScanLogic } from './componentSummaryScanLogic';
import { GraphScanLogic } from './graphScanLogic';
import { ProjectDetails } from '../types/component';
import { ComponentDetails } from 'jfrog-client-js';
import Set from 'typescript-collections/dist/lib/Set';
import { Severity } from '../types/severity';
import { IScannedCveObject } from '../types/scannedCveObject';
import { CveDetails, ProjectComponents } from '../types/projectComponents';

/**
 * Provides the scan logic type - "summary/component" or "scan/graph" according to the Xray version.
 */
export class ScanLogicManager implements ExtensionComponent {
    constructor(protected _connectionManager: ConnectionManager, protected _scanCacheManager: ScanCacheManager, protected _logManager: LogManager) {}

    activate() {
        return this;
    }

    public async scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        projectsDetails: ProjectDetails[],
        quickScan: boolean,
        checkCanceled: () => void
    ) {
        let totalDependenciesToScan: Set<ComponentDetails> = new Set<ComponentDetails>();
        // Save all the components that will be sent to Xray for scanning.
        for (const projectDetails of projectsDetails) {
            projectDetails.toArray().forEach(el => {
                totalDependenciesToScan.add(el);
            });
        }
        if (totalDependenciesToScan.size() === 0) {
            return;
        }
        let scanGraphSupported: boolean = await ConnectionUtils.testXrayVersionForScanGraph(
            this._connectionManager.createJfrogClient(),
            this._logManager
        );
        let projectComponents: ProjectComponents = { componentIdToCve: new Map() };
        let scanLogic: AbstractScanLogic = scanGraphSupported
            ? new GraphScanLogic(this._connectionManager, this._scanCacheManager)
            : new ComponentSummaryScanLogic(this._connectionManager, this._scanCacheManager);
        await scanLogic.scanAndCache(progress, totalDependenciesToScan, projectComponents, checkCanceled);
        for (const projectDetails of projectsDetails) {
            const scannedCveObject: IScannedCveObject = {
                cves: new Map<string, Severity>(),
                projectPath: projectDetails.path
            } as IScannedCveObject;
            if (!quickScan) {
                // Deletes old cache file related to Project's CVEs.
                this._scanCacheManager.deleteScannedCves(scannedCveObject.projectPath);
            }
            projectDetails.toArray().forEach(project => {
                const cveDetails: CveDetails | undefined = projectComponents.componentIdToCve.get(project.component_id);
                if (cveDetails !== undefined) {
                    // Set all the component's CVEs
                    for (const [cve, sevirity] of cveDetails.cveToSeverity) {
                        scannedCveObject.cves.set(cve, sevirity);
                    }
                }
            });
            this._scanCacheManager.storeScannedCves(scannedCveObject);
        }
    }
}
