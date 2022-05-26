// import * as vscode from 'vscode';
// import { SourceCodeRootTreeNode } from './sourceCodeRootTreeNode';

// // Represent the most top-level CVE applicability tree node.
// // Each child is a different project (workspace)
// export class CveApplicabilityRoot extends vscode.TreeItem {
//     constructor(private _children: SourceCodeRootTreeNode[], collapsed?: vscode.TreeItemCollapsibleState) {
//         super('CVE Applicability', collapsed);
//         this.tooltip =
//             "Applicability scanning allows the developer to prioritize the discovered component vulnerabilities. This prioritization is performed by analyzing the developer's (1st party) code and checking whether each vulnerability is actually exploitable in the context of the way the corresponding library is used in the code. Ruling out unexploitable vulnerabilities allows focusing on taking care of issues having largest actual security impact.";
//     }

//     public get children(): SourceCodeRootTreeNode[] {
//         return this._children;
//     }

//     public set children(value: SourceCodeRootTreeNode[]) {
//         this._children = value;
//     }
// }
