// import { DependenciesTreeNode } from '../../treeDataProviders/dependenciesTree/dependenciesTreeNode';
// import { Translators } from '../../utils/translators';

// /**
//  * Represents the shared code between ExportableVulnerability and ExportableViolatedLicense.
//  **/
// export abstract class ExportableComponent {
//     constructor(private _directDependency: DependenciesTreeNode, private _component: string) {
//         this.setImpactedDependency(this._component);
//         let parent: DependenciesTreeNode | undefined = this._directDependency.parent;
//         if (parent) {
//             this.setType(Translators.capitalize(parent.generalInfo.pkgType));
//         }
//         this.appendDirectDependency(this._directDependency);
//     }

//     public abstract setImpactedDependencyName(impactedDependencyName: string): void;

//     public abstract setImpactedDependencyVersion(impactedDependencyVersion: string): void;

//     public abstract setType(type: string): void;

//     public abstract addDirectDependency(directDependency: string): void;

//     public setImpactedDependency(impactedDependency: string): void {
//         this.setImpactedDependencyName(impactedDependency.substring(0, impactedDependency.lastIndexOf(':')));
//         this.setImpactedDependencyVersion(impactedDependency.substring(impactedDependency.lastIndexOf(':') + 1));
//     }

//     public appendDirectDependency(directDependency: DependenciesTreeNode): void {
//         this.addDirectDependency(directDependency.generalInfo.getComponentId());
//     }
// }
