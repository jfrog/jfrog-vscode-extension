// import * as vscode from 'vscode';
// import { ConnectionManager } from '../connect/connectionManager';
// import { ConnectionUtils } from '../connect/connectionUtils';
// import { ExtensionComponent } from '../extensionComponent';
// import { LogManager } from '../log/logManager';
// import { ScanCacheManager } from '../cache/scanCacheManager';
// import { AbstractScanLogic } from './abstractScanLogic';
// // import { ComponentSummaryScanLogic } from './componentSummaryScanLogic';
// import { GraphScanLogic } from './graphScanLogic';
// import { ProjectDetails } from '../types/projectDetails';
// import { ComponentDetails, IGraphResponse, XrayScanProgress } from 'jfrog-client-js';
// import Set from 'typescript-collections/dist/lib/Set';
// import { Severity } from '../types/severity';
// import { CveDetails, ProjectComponents } from '../types/projectComponents';
// import { IProjectDetailsCacheObject } from '../types/IProjectDetailsCacheObject';
// // import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
// import { RootNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';

// /**
//  * Provides the scan logic type - "summary/component" or "scan/graph" according to the Xray version.
//  */
// export class ScanLogicManager implements ExtensionComponent {
//     constructor(protected _connectionManager: ConnectionManager, protected _scanCacheManager: ScanCacheManager, protected _logManager: LogManager) {}

//     activate() {
//         return this;
//     }

//     public async scanWithGraph(progress: XrayScanProgress, projectRoot: RootNode, checkCanceled: () => void): Promise<IGraphResponse> {
//         let scanGraphSupported: boolean = await ConnectionUtils.testXrayVersionForScanGraph(
//             this._connectionManager.createJfrogClient(),
//             this._logManager
//         );
//         if (!scanGraphSupported) {
//             // TODO: show warning for deprecated
//             this._logManager.logError(new Error('scan with graph is not supported'), true);
//             return {} as IGraphResponse;
//         }
//         let scanLogic: GraphScanLogic = new GraphScanLogic(this._connectionManager, this._scanCacheManager);
//         // return this._connectionManager.scanWithGraph(
//         //     graphRequest,
//         //     progress,
//         //     checkCanceled,
//         //     Configuration.getProjectKey(),
//         //     Configuration.getWatches()
//         // );
//         return scanLogic.scan(projectRoot, progress, checkCanceled);
//     }

//     // ==============================

//     // Run an Xry scan on all projects dependencies and cache the results.
//     public async scanAndCache(
//         progress: vscode.Progress<{ message?: string; increment?: number }>,
//         projectsDetails: ProjectDetails[],
//         quickScan: boolean,
//         checkCanceled: () => void
//     ) {
//         let totalDependenciesToScan: Set<ComponentDetails> = this.mergeProjectsDependencies(projectsDetails);
//         let ScanResults: ProjectComponents = await this.runXrayScan(progress, totalDependenciesToScan, checkCanceled);
//         this.mapProjectsCves(projectsDetails, quickScan, ScanResults);
//     }

//     // Merge all known project dependencies in a hash set
//     private mergeProjectsDependencies(projectsDetails: ProjectDetails[]): Set<ComponentDetails> {
//         let totalDependenciesToScan: Set<ComponentDetails> = new Set<ComponentDetails>();
//         for (const projectDetails of projectsDetails) {
//             projectDetails.toArray().forEach(el => {
//                 totalDependenciesToScan.add(el);
//             });
//         }
//         return totalDependenciesToScan;
//     }

//     // Run Xray scan and cache the results.
//     private async runXrayScan(
//         progress: vscode.Progress<{ message?: string; increment?: number }>,
//         totalDependenciesToScan: Set<ComponentDetails>,
//         checkCanceled: () => void
//     ): Promise<ProjectComponents> {
//         let scanResults: ProjectComponents = { componentIdToCve: new Map() };
//         if (totalDependenciesToScan.size() === 0) {
//             return scanResults;
//         }
//         let scanGraphSupported: boolean = await ConnectionUtils.testXrayVersionForScanGraph(
//             this._connectionManager.createJfrogClient(),
//             this._logManager
//         );
//         if (!scanGraphSupported) {
//             // TODO: show warning for deprecated
//             // this._logManager.logError(error, true);
//         }
//         // let scanLogic: AbstractScanLogic = scanGraphSupported
//         //     ? new GraphScanLogic(this._connectionManager, this._scanCacheManager)
//         //     : new ComponentSummaryScanLogic(this._connectionManager, this._scanCacheManager);
//         let scanLogic: AbstractScanLogic = new GraphScanLogic(this._connectionManager, this._scanCacheManager);
//         await scanLogic.scanAndCache(progress, totalDependenciesToScan, scanResults, checkCanceled);
//         return scanResults;
//     }

//     // Update each project's CVEs using X-ray scan results
//     private mapProjectsCves(projectsDetails: ProjectDetails[], quickScan: boolean, scanResults: ProjectComponents) {
//         for (const projectDetails of projectsDetails) {
//             const projectDetailsCacheObject: IProjectDetailsCacheObject = {
//                 cves: new Map<string, Severity>(),
//                 projectPath: projectDetails.path,
//                 projectName: projectDetails.name
//             } as IProjectDetailsCacheObject;
//             if (!quickScan) {
//                 // Deletes the old CVEs cache file for the given project.
//                 this._scanCacheManager.deleteProjectDetailsCacheObject(projectDetailsCacheObject.projectPath);
//             }
//             projectDetails.toArray().forEach(project => {
//                 const cveDetails: CveDetails | undefined = scanResults.componentIdToCve.get(project.component_id);
//                 if (cveDetails !== undefined) {
//                     // Set all the component's CVEs
//                     for (const [cve, severity] of cveDetails.cveToSeverity) {
//                         projectDetailsCacheObject.cves.set(cve, severity);
//                     }
//                 }
//             });
//             this._scanCacheManager.storeProjectDetailsCacheObject(projectDetailsCacheObject);
//         }
//     }
// }
