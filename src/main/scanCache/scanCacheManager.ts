import { IArtifact } from 'xray-client-js';
import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { ScanCacheObject } from './scanCacheObject';
import { IComponentMetadata } from '../goCenterClient/model/ComponentMetadata';

/**
 * Provide the scan results cache in a key-value style map.
 */
export class ScanCacheManager implements ExtensionComponent {
    private _scanCache!: vscode.Memento;

    public activate(context: vscode.ExtensionContext): ScanCacheManager {
        this._scanCache = context.workspaceState;
        return this;
    }

    /**
     * Get artifact from cache or undefined if absent.
     *
     * @param componentId The component id
     */
    public getArtifact(componentId: string): IArtifact | undefined {
        let scanCacheObject: ScanCacheObject | undefined = this._scanCache.get(componentId);
        if (!scanCacheObject) {
            return;
        }
        return scanCacheObject._artifact;
    }

    /**
     * Get component's metadata from cache or undefined if absent.
     *
     * @param componentId The component id
     */
    public getMetadata(componentId: string): IComponentMetadata | undefined {
        let scanCacheObject: ScanCacheObject | undefined = this._scanCache.get(componentId);
        if (!scanCacheObject) {
            return;
        }
        return scanCacheObject._componentMetadata;
    }

    /**
     * Check if exist in cache and not expired. If expired - Delete from cache.
     *
     * @param componentId The component id.
     * @returns true if component exist and not expired.
     */
    public validateOrDelete(componentId: string): boolean {
        let scanCacheObject: ScanCacheObject | undefined = this._scanCache.get(componentId);
        if (!scanCacheObject) {
            // Artifact not exists in cache
            return false;
        }
        if (ScanCacheObject.isInvalid(scanCacheObject._lastUpdated)) {
            // Artifact older than 1 week
            this.delete(componentId);
            return false;
        }
        return true;
    }

    private delete(componentId: string) {
        this._scanCache.update(componentId, undefined);
    }

    public async addArtifactComponents(artifacts: IArtifact[]) {
        for (let artifact of artifacts) {
            await this._scanCache.update(artifact.general.component_id, ScanCacheObject.createXrayCache(artifact));
        }
    }

    /**
     * Iterate and cache each component.
     *
     * @param components - The components that need to be cached.
     */
    public async addMetadataComponents(components: IComponentMetadata[]) {
        for (let component of components) {
            await this._scanCache.update(component.component_id, ScanCacheObject.createGoCenterCache(component));
        }
    }
}
