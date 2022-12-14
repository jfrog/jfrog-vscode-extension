// import Set from 'typescript-collections/dist/lib/Set';
// import * as vscode from 'vscode';
// import { ExtensionComponent } from '../extensionComponent';
// import { IIssueCacheObject } from '../types/issueCacheObject';
// // import { ScanCacheManager } from '../cache/scanCacheManager';
// import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
// import { AbstractDependencyUpdate } from './abstractDependencyUpdate';
// import { GoDependencyUpdate } from './goDependencyUpdate';
// import { MavenDependencyUpdate } from './mavenDependencyUpdate';
// import { NpmDependencyUpdate } from './npmDependencyUpdate';
// import { YarnDependencyUpdate } from './yarnDependencyUpdate';

// /**
//  * Update the dependency version in the project descriptor (e.g. pom.xml) file after right click on the components tree and a left click on "Update dependency to fixed version".
//  */
// export class DependencyUpdateManager implements ExtensionComponent {
//     private _dependencyUpdaters: AbstractDependencyUpdate[] = [];

//     constructor(private _scanCacheManager: ScanCacheManager) {
//         this._dependencyUpdaters.push(new MavenDependencyUpdate(), new NpmDependencyUpdate(), new YarnDependencyUpdate(), new GoDependencyUpdate());
//     }

//     public activate() {
//         return this;
//     }

//     public async updateDependencyVersion(dependenciesTreeNode: DependenciesTreeNode): Promise<boolean> {
//         let fixedVersion: string = await this.getFixedVersion(dependenciesTreeNode);
//         if (!fixedVersion) {
//             return false;
//         }
//         fixedVersion = fixedVersion.replace(/[\][]/g, '');
//         this._dependencyUpdaters
//             .filter(node => node.isMatched(dependenciesTreeNode))
//             .forEach(node => node.updateDependencyVersion(dependenciesTreeNode, fixedVersion));
//         return true;
//     }
//     /**
//      * Returns the version to be updated for dependenciesTreeNode. If more than one version exists,
//      * a quick  pick will appear to the user and a list of versions will be shown, the chosen version will be returned.
//      */
//     public async getFixedVersion(dependenciesTreeNode: DependenciesTreeNode) {
//         let fixedVersions: Set<string> = new Set<string>();
//         dependenciesTreeNode.issues.forEach(xrayIssueId => {
//             if (xrayIssueId.component === dependenciesTreeNode.componentId) {
//                 let issue: IIssueCacheObject | undefined = this._scanCacheManager.getIssue(xrayIssueId.issue_id);
//                 if (!issue) {
//                     return;
//                 }
//                 issue.fixedVersions?.forEach(fixedVersion => fixedVersions.add(fixedVersion));
//             }
//         });
//         let fixedVersionsArr: string[] = fixedVersions.toArray();
//         switch (fixedVersions.size()) {
//             case 0:
//                 return '';
//             case 1:
//                 return fixedVersionsArr[0];
//             default: {
//                 let chosenFixedVersion: string =
//                     (await vscode.window.showQuickPick(fixedVersionsArr, {
//                         canPickMany: false,
//                         placeHolder: `Choose a fixed version for '` + dependenciesTreeNode.componentId + `'`
//                     })) || '';
//                 return fixedVersions.contains(chosenFixedVersion) ? chosenFixedVersion : '';
//             }
//         }
//     }
// }
