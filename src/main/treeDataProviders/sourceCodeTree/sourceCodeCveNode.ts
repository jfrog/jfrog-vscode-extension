// import * as vscode from 'vscode';
// import { ContextKeys } from '../../constants/contextKeys';
// import { Severity } from '../../types/severity';
// import { TreeDataHolder } from '../utils/treeDataHolder';
// import { SourceCodeFileTreeNode } from './sourceCodeFileTreeNode';

// // Represent a CVE node in CVE Applicability view.
// export class SourceCodeCveTreeNode extends vscode.TreeItem {
//     private _children: SourceCodeCveTreeNodeDetails[] = [];

//     constructor(
//         private _cve: string,
//         _sourceCodeCveTreeNodeDetails: SourceCodeCveTreeNodeDetails,
//         private _parent?: SourceCodeFileTreeNode,
//         private _severity?: Severity,
//         contextValue?: string
//     ) {
//         super(_cve, vscode.TreeItemCollapsibleState.Collapsed);
//         this.tooltip = 'Security vulnerability';
//         if (contextValue === undefined) {
//             this.contextValue = ContextKeys.SHOW_IN_SOURCE_CODE_ENABLED;
//         }
//         this._children.push(_sourceCodeCveTreeNodeDetails);
//         if (_parent) {
//             _parent.children.push(this);
//         }
//     }

//     public get cve(): string {
//         return this._cve;
//     }

//     public set cve(value: string) {
//         this._cve = value;
//     }

//     public get parent(): SourceCodeFileTreeNode | undefined {
//         return this._parent;
//     }

//     public set parent(value: SourceCodeFileTreeNode | undefined) {
//         this._parent = value;
//     }

//     public getNodeDetails(): SourceCodeCveTreeNodeDetails[] {
//         return this._children;
//     }

//     /**
//      * @returns Returns CVe's source code file path or empty string.
//      */
//     public getFile(): string {
//         if (this.parent?.filePath) {
//             return this.parent.filePath;
//         }
//         return '';
//     }

//     public get children(): (TreeDataHolder | vscode.TreeItem)[] {
//         const results: TreeDataHolder[] = [];
//         for (let i: number = 0; i < this._children.length; i++) {
//             results.push(
//                 new TreeDataHolder('Code issue', this._children[i].codeIssue, undefined, undefined, undefined, {
//                     command: 'jfrog.source.code.scan.jumpToSource',
//                     title: 'Jump To Code',
//                     arguments: [this, i]
//                 })
//             );
//             results.push(
//                 new TreeDataHolder('Code reference', this._children[i].codeReferences, undefined, undefined, undefined, {
//                     command: 'jfrog.source.code.scan.jumpToSource',
//                     title: 'Jump To Code',
//                     arguments: [this, i]
//                 })
//             );
//         }
//         return results;
//     }

//     public addChildren(value: SourceCodeCveTreeNodeDetails) {
//         this._children.push(value);
//     }

//     public get severity(): Severity | undefined {
//         return this._severity;
//     }

//     public set severity(value: Severity | undefined) {
//         this._severity = value;
//     }
// }

// export class SourceCodeCveTreeNodeDetails {
//     constructor(
//         private _codeIssue: string,
//         private _codeReferences: string,
//         private _startColumn: number,
//         private _endColumn: number,
//         private _startLine: number,
//         private _endLine: number
//     ) {}
//     public get endLine(): number {
//         return this._endLine;
//     }

//     public set endLine(value: number) {
//         this._endLine = value;
//     }

//     public get startLine(): number {
//         return this._startLine;
//     }

//     public set startLine(value: number) {
//         this._startLine = value;
//     }

//     public get endColumn(): number {
//         return this._endColumn;
//     }

//     public set endColumn(value: number) {
//         this._endColumn = value;
//     }

//     public get startColumn(): number {
//         return this._startColumn;
//     }

//     public set startColumn(value: number) {
//         this._startColumn = value;
//     }

//     public get codeReferences(): string {
//         return this._codeReferences;
//     }

//     public set codeReferences(value: string) {
//         this._codeReferences = value;
//     }

//     public get codeIssue(): string {
//         return this._codeIssue;
//     }

//     public set codeIssue(value: string) {
//         this._codeIssue = value;
//     }
// }
