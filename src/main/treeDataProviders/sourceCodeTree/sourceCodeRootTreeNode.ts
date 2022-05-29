/*************************************************************
 * The following logic is part of the CVE applicability scan.*
 * It will be hidden until it is officially released.        *
 * ***********************************************************
 */
// import * as vscode from 'vscode';
// import { PackageType } from '../../types/projectType';
// import { SourceCodeCveTreeNode } from './sourceCodeCveNode';
// import { SourceCodeFileTreeNode } from './sourceCodeFileTreeNode';
// import * as path from 'path';
// import { CveApplicabilityRoot } from './CveApplicabilityRoot';

// // Represent a root project node containing vulnerable files, in the CVE Applicability view.
// export class SourceCodeRootTreeNode extends vscode.TreeItem {
//     private _notApplicableCves: Set<string> = new Set<string>();
//     private _applicableCves: Map<string, SourceCodeCveTreeNode> = new Map<string, SourceCodeCveTreeNode>();

//     constructor(
//         private _workspaceFolder: string,
//         private _projectType: PackageType,
//         private _children: SourceCodeFileTreeNode[],
//         private _parent?: CveApplicabilityRoot
//     ) {
//         super(_workspaceFolder.substring(_workspaceFolder.lastIndexOf(path.sep) + 1), vscode.TreeItemCollapsibleState.Expanded);
//         if (_parent) {
//             _parent.children.push(this);
//         }
//         if (_workspaceFolder.indexOf(path.sep) !== -1) {
//             this.description = _workspaceFolder;
//         }
//     }

//     public get workspaceFolder() {
//         return this._workspaceFolder;
//     }

//     public set workspaceFolder(wsFolder: string) {
//         this._workspaceFolder = wsFolder;
//     }

//     public get applicableCves(): Map<string, SourceCodeCveTreeNode> {
//         return this._applicableCves;
//     }

//     public set applicableCves(value: Map<string, SourceCodeCveTreeNode>) {
//         this._applicableCves = value;
//     }

//     public get projectType(): PackageType {
//         return this._projectType;
//     }

//     public set projectType(value: PackageType) {
//         this._projectType = value;
//     }

//     public get noApplicableCves(): Set<string> {
//         return this._notApplicableCves;
//     }

//     public set noApplicableCves(value: Set<string>) {
//         this._notApplicableCves = value;
//     }

//     public get parent(): CveApplicabilityRoot | undefined {
//         return this._parent;
//     }

//     public set parent(value: CveApplicabilityRoot | undefined) {
//         this._parent = value;
//     }

//     public get children(): SourceCodeFileTreeNode[] {
//         return this._children;
//     }

//     public set children(value: SourceCodeFileTreeNode[]) {
//         this._children = value;
//     }

//     public addChild(child: SourceCodeFileTreeNode) {
//         this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
//         this.children.push(child);
//     }

//     public isCveScanned(cve: string): boolean {
//         return this.isCveApplicable(cve) || this.isCveNotApplicable(cve);
//     }

//     public isCveApplicable(cve: string): boolean {
//         return this.applicableCves.has(cve) || false;
//     }

//     public isCveNotApplicable(cve: string): boolean {
//         return this.noApplicableCves.has(cve) || false;
//     }
// }
