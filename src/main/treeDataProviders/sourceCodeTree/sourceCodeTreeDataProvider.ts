/*************************************************************
 * The following logic is part of the CVE applicability scan.*
 * It will be hidden until it is officially released.        *
 * ***********************************************************
 */
// import * as vscode from 'vscode';
// import { TreesManager } from '../treesManager';
// import { SourceCodeFileTreeNode } from './sourceCodeFileTreeNode';
// import { SourceCodeRootTreeNode } from './sourceCodeRootTreeNode';
// import { Severity, SeverityUtils } from '../../types/severity';
// import { SourceCodeCveTreeNode, SourceCodeCveTreeNodeDetails } from './sourceCodeCveNode';
// import { PackageDescriptorUtils } from '../../types/projectType';
// import { TreeDataHolder } from '../utils/treeDataHolder';
// import { CveApplicabilityRoot } from './CveApplicabilityRoot';
// import * as os from 'os';
// import * as path from 'path';
// import { ScanUtils } from '../../utils/scanUtils';
// import { Configuration } from '../../utils/configuration';
// import { Resource } from '../../utils/resource';
// import { ApplicabilityScanResult, ApplicabilityScanResults } from '../../types/applicabilityScanResults';
// import { PackageType } from '../../types/projectType';
// import { IScannedCveObject } from '../../types/scannedCveObject';
// import { Components } from '../../types/component';

// export class SourceCodeTreeDataProvider
//     implements vscode.TreeDataProvider<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot> {
//     protected _cveApplicabilityRoot!: CveApplicabilityRoot;
//     private _resource: Resource;
//     private static readonly SCANNER_EXE_NAME: string = os.platform() === 'win32' ? 'ide_code_scanner.exe' : 'ide_code_scanner';
//     private static readonly APPLICABILITY_SCANNER_WINDOWS_DOWNLOAD_PATH: string = 'ide-scanners/ide_scanners/0.1.0/windows/ide_code_scanner.exe';
//     private static readonly APPLICABILITY_SCANNER_MAC_DOWNLOAD_PATH: string = 'ide-scanners/ide_scanners/0.1.0/mac/ide_code_scanner';
//     private static readonly APPLICABILITY_SCANNER_LINUX_DOWNLOAD_PATH: string = 'ide-scanners/ide_scanners/0.1.0/linux/ide_code_scanner';

//     private _onDidChangeTreeData: vscode.EventEmitter<
//         SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot | undefined
//     > = new vscode.EventEmitter<SourceCodeRootTreeNode | undefined>();
//     readonly onDidChangeTreeData: vscode.Event<
//         SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot | undefined
//     > = this._onDidChangeTreeData.event;
//     private fileToNode: Map<string, SourceCodeFileTreeNode> = new Map<string, SourceCodeFileTreeNode>();
//     private workspaceToTree: Map<string, SourceCodeRootTreeNode> = new Map<string, SourceCodeRootTreeNode>();

//     constructor(protected _workspaceFolders: vscode.WorkspaceFolder[], protected _treesManager: TreesManager) {
//         os.platform() === 'win32';
//         let downloadPath: string = '';
//         switch (os.platform()) {
//             case 'win32':
//                 downloadPath = SourceCodeTreeDataProvider.APPLICABILITY_SCANNER_WINDOWS_DOWNLOAD_PATH;
//                 break;
//             case 'linux':
//                 downloadPath = SourceCodeTreeDataProvider.APPLICABILITY_SCANNER_LINUX_DOWNLOAD_PATH;
//                 break;
//             case 'darwin':
//                 downloadPath = SourceCodeTreeDataProvider.APPLICABILITY_SCANNER_MAC_DOWNLOAD_PATH;
//                 break;
//         }
//         this._resource = new Resource(
//             path.join(ScanUtils.getHomePath(), 'applicability.scan'),
//             downloadPath,
//             SourceCodeTreeDataProvider.SCANNER_EXE_NAME,
//             this._treesManager.logManager,
//             Configuration.getRemoteArtifactory() !== '' ? this._treesManager.connectionManager : undefined
//         );
//     }

//     public async updateScanner(): Promise<void> {
//         if (await this._resource.isUpdateAvailable()) {
//             await this._resource.download();
//         }
//     }

//     public async scan() {
//         // this.updateScanner();
//         try {
//             let components: Components[] | undefined;
//             let projectDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
//                 this._workspaceFolders,
//                 this._treesManager.logManager
//             );
//             if (projectDescriptors.size > 0) {
//                 components = [];
//             }
//             for (const [projectType, uris] of projectDescriptors) {
//                 for (const uri of uris) {
//                     components?.push(new Components(path.dirname(uri.fsPath), projectType));
//                 }
//             }
//             this.clearTree();
//             // Scan the source code project with Xray result CVE .
//             if (components !== undefined && components.length > 0) {
//                 for (const component of components) {
//                     let scannedCves: IScannedCveObject | undefined = this._treesManager.scanCacheManager.getScannedCves(component.projectPath);
//                     this.doScan(component.projectPath, component.packageType, scannedCves);
//                 }
//             } else {
//                 // Scan the source code project for all CVE.
//                 for (const workspace of this._workspaceFolders) {
//                     this.doScan(workspace.uri.path, PackageType.UNKNOWN);
//                 }
//             }
//             this.onChangeFire();
//         } catch (error) {
//             this._treesManager.logManager.logMessage('failed to scan error: ' + error, 'ERR');
//         }
//     }

//     private doScan(pathToRoot: string, packageType: PackageType, scannedCves?: IScannedCveObject) {
//         try {
//             const root: SourceCodeRootTreeNode = new SourceCodeRootTreeNode(pathToRoot, packageType, []);
//             this.workspaceToTree.set(pathToRoot, root);
//             let whiteListCves: string = '';
//             let cmdOutput: string = '';

//             // CVEs from Xray scans should be sent to the Applicability scanner..
//             // Alternatively, scan All Known CVEs.
//             if (scannedCves !== undefined && scannedCves.cves.size > 0) {
//                 whiteListCves = ' --cve-whitelist ' + Array.from(scannedCves.cves.keys()).join(',');
//             }
//             cmdOutput = ScanUtils.executeCmd(this._resource.getResourcePath() + ' run-scan ' + pathToRoot + whiteListCves, pathToRoot).toString();
//             if (cmdOutput === '') {
//                 return;
//             }
//             const parsedJson: ApplicabilityScanResults = <ApplicabilityScanResults>JSON.parse(cmdOutput);
//             for (const [cve, cveData] of Object.entries(parsedJson.results)) {
//                 for (const data of cveData) {
//                     this.addCveNode(cve, data, root, scannedCves?.cves.get(cve));
//                 }
//             }
//             for (const cve of parsedJson.scanners_ran) {
//                 if (!root.applicableCves.has(cve)) {
//                     root.noApplicableCves.add(cve);
//                 }
//             }
//         } catch (error) {
//             const node: SourceCodeRootTreeNode | undefined = this.workspaceToTree.get(pathToRoot);
//             if (node !== undefined) {
//                 node.addChild(SourceCodeFileTreeNode.createFailedScan());
//             }
//             this._treesManager.logManager.logError(<any>error, false);
//         }
//     }

//     private addCveNode(cve: string, applicabilityScanResult: ApplicabilityScanResult, root: SourceCodeRootTreeNode, severity?: Severity) {
//         let fileNode: SourceCodeFileTreeNode | undefined = this.fileToNode.get(applicabilityScanResult.file_name);
//         if (fileNode === undefined) {
//             fileNode = new SourceCodeFileTreeNode(applicabilityScanResult.file_name, [], root);
//             this.fileToNode.set(applicabilityScanResult.file_name, fileNode);
//         }
//         const cveNodeDetails: SourceCodeCveTreeNodeDetails = new SourceCodeCveTreeNodeDetails(
//             applicabilityScanResult.text,
//             applicabilityScanResult.snippet,
//             applicabilityScanResult.start_column,
//             applicabilityScanResult.end_column,
//             applicabilityScanResult.start_line,
//             applicabilityScanResult.end_line
//         );
//         let cveNode: SourceCodeCveTreeNode | undefined = root.applicableCves.get(cve);
//         if (cveNode !== undefined) {
//             cveNode.addChildren(cveNodeDetails);
//             return;
//         }
//         cveNode = new SourceCodeCveTreeNode(cve, cveNodeDetails, fileNode, severity);
//         root.applicableCves.set(cve, cveNode);
//     }

//     public isFileScanned(file: string): boolean {
//         return this.fileToNode.has(file) || false;
//     }

//     public isCveApplicable(workspace: string, cve: string): boolean {
//         return this.workspaceToTree.get(workspace)?.applicableCves.has(cve) || false;
//     }

//     public getCveApplicable(workspace: string, cve: string): SourceCodeCveTreeNode | undefined {
//         return this.workspaceToTree.get(workspace)?.applicableCves.get(cve);
//     }

//     public isCveNotApplicable(workspace: string, cve: string): boolean {
//         return this.workspaceToTree.get(workspace)?.noApplicableCves.has(cve) || false;
//     }

//     public getFileTreeNode(file: string): SourceCodeFileTreeNode | undefined {
//         if (!this.isFileScanned(file)) {
//             return undefined;
//         }
//         return this.fileToNode.get(file);
//     }

//     /**
//      * Return a map of 'workspace' -> 'CveApplicabilityTree'
//      */
//     public getScannedProjects(): Map<string, SourceCodeRootTreeNode> {
//         return this.workspaceToTree;
//     }

//     getTreeItem(
//         element: SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot
//     ): vscode.TreeItem | Thenable<vscode.TreeItem> {
//         if (element instanceof SourceCodeRootTreeNode) {
//             element.iconPath = PackageDescriptorUtils.getIcon(element.projectType);
//             return element;
//         }
//         if (element instanceof SourceCodeFileTreeNode) {
//             element.iconPath = SeverityUtils.getIcon(element.topSeverity !== undefined ? element.topSeverity : Severity.Critical);
//             return element;
//         }
//         if (element instanceof SourceCodeCveTreeNode) {
//             element.command = {
//                 command: 'jfrog.source.code.scan.jumpToSource',
//                 title: 'Jump To Code',
//                 arguments: [element]
//             };
//             element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Critical);
//             return element;
//         }
//         if (element instanceof TreeDataHolder) {
//             let holder: TreeDataHolder = <TreeDataHolder>element;
//             let treeItem: vscode.TreeItem = new vscode.TreeItem(holder.key);
//             treeItem.description = holder.value;
//             treeItem.command = holder.command;
//             if (holder.link) {
//                 treeItem.command = {
//                     command: 'vscode.open',
//                     arguments: [vscode.Uri.parse(holder.link)]
//                 } as vscode.Command;
//             }
//             return treeItem;
//         }
//         return element;
//     }

//     public getParent(
//         element: SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode
//     ): Thenable<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot | undefined> {
//         return Promise.resolve(element.parent);
//     }

//     getChildren(
//         element?: SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot
//     ): vscode.ProviderResult<any> {
//         if (element instanceof CveApplicabilityRoot) {
//             if (element.children.length === 1) {
//                 return Promise.resolve(element.children[0].children);
//             }
//         }
//         if (element) {
//             return Promise.resolve(element.children);
//         }
//         this._cveApplicabilityRoot = this.getApplicableFiles();
//         return Promise.resolve([this._cveApplicabilityRoot]);
//     }

//     private getApplicableFiles(): CveApplicabilityRoot {
//         let sourceCodeRootTreeNodes: SourceCodeRootTreeNode[] = [];
//         const cveApplicabilityRoot: CveApplicabilityRoot = new CveApplicabilityRoot(
//             sourceCodeRootTreeNodes,
//             vscode.TreeItemCollapsibleState.Expanded
//         );
//         for (let files of this.getScannedProjects().values()) {
//             files.parent = cveApplicabilityRoot;
//             if (files.children.length === 0) {
//                 files.children.push(SourceCodeFileTreeNode.createNoVulnerabilitiesFound());
//             }
//             sourceCodeRootTreeNodes.push(files);
//         }
//         return cveApplicabilityRoot;
//     }

//     public onChangeFire(): void {
//         this._onDidChangeTreeData.fire();
//     }

//     private clearTree() {
//         this.fileToNode = new Map<string, SourceCodeFileTreeNode>();
//         this.workspaceToTree = new Map<string, SourceCodeRootTreeNode>();
//     }

//     public async refresh() {
//         await this._treesManager.sourceCodeTreeDataProvider.scan();
//     }
// }
