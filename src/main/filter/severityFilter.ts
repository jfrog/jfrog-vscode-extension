// import * as vscode from 'vscode';

// //import { VulnerablitiesTreeDataProvider } from "../treeDataProviders/vulnerablitiesTree/vulnerablitiesTreeDataProvider";
// import { AbstractNodeFilter } from './abstractNodeFilter';
// import { SeverityStrings /*, SeverityUtils */ } from '../types/severity';
// import { FileTreeNode } from '../treeDataProviders/issuesTree/fileTreeNode';

// export class SeverityNodeFilter extends AbstractNodeFilter {
//     constructor(/*private _issuesTreeDataProvider: VulnerablitiesTreeDataProvider*/) {
//         super();
//     }

//     /** @override */
//     protected getValues(): vscode.QuickPickItem[] {
//         let rawOptions: SeverityStrings[] = [
//             SeverityStrings.Unknown,
//             SeverityStrings.Information,
//             SeverityStrings.Low,
//             SeverityStrings.Medium,
//             SeverityStrings.High,
//             SeverityStrings.Critical
//         ];

//         // TODO: filter base on actual results (don't show if nothing is back)

//         return rawOptions
//             .filter(rawOptions => true)
//             .map(
//                 option =>
//                     <vscode.QuickPickItem>{
//                         label: option,
//                         picked: true
//                     }
//             );
//     }

//     /** @override */
//     public isNodePicked(node: FileTreeNode): boolean {
//         if (!this._choice || this.isPicked(SeverityStrings.Normal) /*&& this._issuesTreeDataProvider.issues.isEmpty()*/) {
//             return true;
//         }
//         return true;
//         // return (
//         //     dependenciesTreeNode.issues
//         //         .toArray()
//         //         .map(issueKey => this._scanCacheManager.getIssue(issueKey.issue_id))
//         //         .filter(issue => issue)
//         //         // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
//         //         .map(issue => issue!.severity)
//         //         .map(severity => SeverityUtils.getString(severity))
//         //         .some(severityName => this.isPicked(severityName))
//         // );
//     }
// }
