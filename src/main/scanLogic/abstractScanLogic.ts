import { ComponentDetails } from 'jfrog-client-js';
import * as vscode from 'vscode';
import { ConnectionManager } from '../connect/connectionManager';
import { ScanCacheManager } from '../cache/scanCacheManager';
import Set from 'typescript-collections/dist/lib/Set';
import { ProjectComponents } from '../types/projectComponents';

export abstract class AbstractScanLogic {
    constructor(protected _connectionManager: ConnectionManager, protected _scanCacheManager: ScanCacheManager) {}

    /**
     * Scan components according to the relevant scan logic and store the scan results in the cache.
     * @param progress - the progress bar
     * @param componentsToScan - the components to scan
     * @param checkCanceled - a function that throws ScanCancellationError if the user chose to stop the scan
     * @param projectComponents - A map of componentId (dependency) -> (Cve, severity)
     */
    public abstract scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Set<ComponentDetails>,
        projectComponents: ProjectComponents,
        checkCanceled: () => void
    ): Promise<void>;
}
