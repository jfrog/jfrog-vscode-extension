import { ComponentDetails, IArtifact, IGeneral, IIssue, ILicense } from 'jfrog-client-js';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { AbstractScanLogic } from './abstractScanLogic';
import { ProjectComponents } from '../types/projectComponents';

/**
 * Used in Xray < 3.29.0.
 * Run /summary/components REST API for each 100 components and populate the cache with the responses.
 */
export class ComponentSummaryScanLogic extends AbstractScanLogic {
    public async scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        componentsToScan: Set<ComponentDetails>,
        projectComponents: ProjectComponents,
        checkCanceled: () => void
    ) {
        progress.report({ message: `2/3:📦 Dependencies scanning`, increment: 0 });
        const componentsDetails: ComponentDetails[] = componentsToScan.toArray();
        let step: number = (100 / componentsToScan.size()) * 100;
        for (let currentIndex: number = 0; currentIndex < componentsToScan.size(); currentIndex += 100) {
            checkCanceled();
            let partialComponentsDetails: ComponentDetails[] = componentsDetails.slice(currentIndex, currentIndex + 100);
            let artifacts: IArtifact[] = await this._connectionManager.summaryComponent(partialComponentsDetails);
            this.addMissingComponents(partialComponentsDetails, artifacts);
            await this._scanCacheManager.storeArtifacts(artifacts, projectComponents);
            progress.report({ message: `2/3:📦 Dependencies scanning`, increment: step });
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
