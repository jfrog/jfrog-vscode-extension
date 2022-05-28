import { ComponentDetails, IArtifact, IGeneral, IIssue, ILicense } from 'jfrog-client-js';
import Set from 'typescript-collections/dist/lib/Set';
import * as vscode from 'vscode';
import { Components } from '../types/component';
// import { IScannedCveObject } from '../types/scannedCveObject';
// import { Severity } from '../types/severity';
import { AbstractScanLogic } from './abstractScanLogic';

/**
 * Used in Xray < 3.29.0.
 * Run /summary/components REST API for each 100 components and populate the cache with the responses.
 */
export class ComponentSummaryScanLogic extends AbstractScanLogic {
    public async scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        Components: Components[],
        checkCanceled: () => void
    ) {
        let totalComponents: number = 0;
        for (const componentsToScan of Components) {
            totalComponents = componentsToScan.componentsDetails.size();
        }
        progress.report({ message: `2/2:📦 Dependencies scanning`, increment: 0 });
        let step: number = (100 / totalComponents) * 100;
        for (const componentsToScan of Components) {
            // let scannedCves: IScannedCveObject = {
            //     cves: new Map<string, Severity>(),
            //     projectPath: componentsToScan.projectPath
            // } as IScannedCveObject;
            const ComponentsDetails: ComponentDetails[] = componentsToScan.componentsDetails.toArray();
            for (let currentIndex: number = 0; currentIndex < componentsToScan.componentsDetails.size(); currentIndex += 100) {
                checkCanceled();
                let partialComponentsDetails: ComponentDetails[] = ComponentsDetails.slice(currentIndex, currentIndex + 100);
                let artifacts: IArtifact[] = await this._connectionManager.summaryComponent(partialComponentsDetails);
                this.addMissingComponents(partialComponentsDetails, artifacts);
                await this._scanCacheManager.storeArtifacts(
                    artifacts
                    // , scannedCves
                );
                progress.report({ message: `2/2:📦 Dependencies scanning`, increment: step });
            }
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
