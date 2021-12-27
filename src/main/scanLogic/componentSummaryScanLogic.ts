import { ComponentDetails, IArtifact, IGeneral, IIssue, ILicense } from 'jfrog-client-js';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { AbstractScanLogic } from './abstractScanLogic';

/**
 * Used in Xray < 3.29.0.
 * Run /summary/components REST API for each 100 components and populate the cache with the responses.
 */
export class ComponentSummaryScanLogic extends AbstractScanLogic {
    public async scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Set<ComponentDetails>,
        checkCanceled: () => void
    ) {
        const totalComponents: number = componentsToScan.size();
        progress.report({ message: `${totalComponents} components` });
        let componentDetails: ComponentDetails[] = componentsToScan.toArray();
        let step: number = (100 / totalComponents) * 100;
        for (let currentIndex: number = 0; currentIndex < componentsToScan.size(); currentIndex += 100) {
            checkCanceled();
            let partialComponents: ComponentDetails[] = componentDetails.slice(currentIndex, currentIndex + 100);
            let artifacts: IArtifact[] = await this._connectionManager.summaryComponent(partialComponents);
            this.addMissingComponents(partialComponents, artifacts);
            await this._scanCacheManager.storeArtifacts(artifacts);
            progress.report({ message: `${totalComponents} components`, increment: step });
        }
    }

    private addMissingComponents(partialComponents: ComponentDetails[], artifacts: IArtifact[]): void {
        if (artifacts.length === partialComponents.length) {
            return;
        }
        let missingComponents: Set<string> = new Set<string>();
        // Add all partial components to the missing components set
        partialComponents
            .map(component => component.component_id)
            .map(componentId => componentId.substring(componentId.indexOf('://') + 3))
            .forEach(component => missingComponents.add(component));
        // Remove successfully scanned components
        artifacts.map(artifact => artifact.general.component_id).forEach(componentId => missingComponents.remove(componentId));

        missingComponents.forEach(missingComponent => {
            artifacts.push(<IArtifact>{
                general: <IGeneral>{ component_id: missingComponent },
                issues: [] as IIssue[],
                licenses: [] as ILicense[]
            });
        });
    }
}
