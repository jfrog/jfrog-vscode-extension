import * as vscode from 'vscode';
import * as os from 'os';
import { TreesManager } from '../treesManager';
import { SourceCodeFileTreeNode } from './sourceCodeFileTreeNode';
import { SourceCodeRootTreeNode } from './sourceCodeRootTreeNode';
import { Severity, SeverityUtils } from '../../types/severity';
import { SourceCodeCveTreeNode, SourceCodeCveTreeNodeDetails } from './sourceCodeCveNode';
import { TreeDataHolder } from '../utils/treeDataHolder';
import { CveApplicabilityRoot } from './cveApplicabilityRoot';
import * as path from 'path';
import { ScanUtils } from '../../utils/scanUtils';
import { ApplicabilityScanResult, ApplicabilityScanResults } from '../../types/applicabilityScanResults';
import { PackageType } from '../../types/projectType';
import { PackageDescriptorUtils } from '../../utils/iconsPaths';
import { CveApplicabilityRunner } from '../../utils/cveApplicabilityRunner';
import { IProjectDetailsCacheObject } from '../../types/IProjectDetailsCacheObject';
import { Utils } from '../utils/utils';

export class SourceCodeTreeDataProvider
    implements vscode.TreeDataProvider<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot> {
    protected _cveApplicabilityRoot: CveApplicabilityRoot | undefined;

    private _cveApplicabilityRunner: CveApplicabilityRunner;

    private _onDidChangeTreeData: vscode.EventEmitter<
        SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot | undefined
    > = new vscode.EventEmitter<SourceCodeRootTreeNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<
        SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot | undefined
    > = this._onDidChangeTreeData.event;
    private fileToNode: Map<string, SourceCodeFileTreeNode> = new Map<string, SourceCodeFileTreeNode>();
    private workspaceToTree: Map<string, SourceCodeRootTreeNode> = new Map<string, SourceCodeRootTreeNode>();

    constructor(protected _workspaceFolders: vscode.WorkspaceFolder[], protected _treesManager: TreesManager) {
        this._cveApplicabilityRunner = new CveApplicabilityRunner(_treesManager.connectionManager, _treesManager.logManager);
    }

    public async scanProjects() {
        try {
            let projectDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(
                this._workspaceFolders,
                this._treesManager.logManager
            );
            // No projects descriptors are found.
            // Scan each workspaces for all known CVEs using the CVE Applicability Scanner.
            if (projectDescriptors.size === 0) {
                for (const workspace of this._workspaceFolders) {
                    this.scanProject(workspace.uri.path, PackageType.UNKNOWN);
                }
                return;
            }
            // Found project descriptors.
            // Utilize the CVEs from the dependency tree scan for the applicability scan.
            for (const [projectType, uris] of projectDescriptors) {
                for (const uri of uris) {
                    // Only python & npm are supported for CVE Applicability scan.
                    if (![PackageType.NPM, PackageType.YARN, PackageType.PYTHON].includes(projectType)) {
                        continue;
                    }
                    // Load CVEs from cache (if any) and pass it to CVE applicability scanner.
                    const projectPath: string = path.dirname(uri.fsPath);
                    let scannedCves: IProjectDetailsCacheObject | undefined = this._treesManager.scanCacheManager.getProjectDetailsCacheObject(
                        projectPath
                    );
                    this.scanProject(projectPath, projectType, scannedCves);
                }
            }
        } catch (error) {
            this._treesManager.logManager.logMessage('CVE Applicability failed to scan project. Error: ' + error, 'ERR');
        }
    }

    private scanProject(pathToRoot: string, packageType: PackageType, scannedCves?: IProjectDetailsCacheObject) {
        try {
            const root: SourceCodeRootTreeNode = new SourceCodeRootTreeNode(pathToRoot, packageType, scannedCves?.projectName);
            this.workspaceToTree.set(pathToRoot, root);
            let whiteListCves: string = '';
            let cmdOutput: string | undefined;

            // CVEs from Xray scans should be sent to the Applicability scanner.
            // Alternatively, scan All Known CVEs.
            if (scannedCves !== undefined && scannedCves.cves?.size > 0) {
                whiteListCves = Array.from(scannedCves.cves.keys()).join(',');
            }

            cmdOutput = this._cveApplicabilityRunner.scan(pathToRoot, whiteListCves, packageType);
            if (cmdOutput === undefined) {
                this._treesManager.logManager.logMessage('CVE Applicability is not supported for' + os.platform(), 'DEBUG');
                return;
            }
            if (cmdOutput === '') {
                throw new Error('CVE Applicability did not generate any output');
            }
            const parsedJson: ApplicabilityScanResults = <ApplicabilityScanResults>JSON.parse(cmdOutput);
            for (const [cve, cveData] of Object.entries(parsedJson.results)) {
                for (const data of cveData) {
                    this.addCveNode(cve, data, root, scannedCves?.cves?.get(cve));
                }
            }
            for (const cve of parsedJson.scanners_ran) {
                if (!root.applicableCves.has(cve)) {
                    root.noApplicableCves.add(cve);
                }
            }
        } catch (error) {
            const node: SourceCodeRootTreeNode | undefined = this.workspaceToTree.get(pathToRoot);
            if (node !== undefined) {
                node.addChild(SourceCodeFileTreeNode.createFailedScanNode());
            }
            this._treesManager.logManager.logError(<any>error, false);
        }
    }

    public async update() {
        return await this._cveApplicabilityRunner.update();
    }

    private addCveNode(cve: string, applicabilityScanResult: ApplicabilityScanResult, root: SourceCodeRootTreeNode, severity?: Severity) {
        let fileNode: SourceCodeFileTreeNode | undefined = this.fileToNode.get(applicabilityScanResult.file_name);
        if (fileNode === undefined) {
            fileNode = new SourceCodeFileTreeNode(applicabilityScanResult.file_name, [], root);
            this.fileToNode.set(applicabilityScanResult.file_name, fileNode);
        }
        const cveNodeDetails: SourceCodeCveTreeNodeDetails = new SourceCodeCveTreeNodeDetails(
            applicabilityScanResult.text,
            applicabilityScanResult.snippet,
            applicabilityScanResult.start_column,
            applicabilityScanResult.end_column,
            applicabilityScanResult.start_line,
            applicabilityScanResult.end_line
        );
        let cveNode: SourceCodeCveTreeNode | undefined = root.applicableCves.get(cve);
        if (cveNode !== undefined) {
            cveNode.addChildren(cveNodeDetails);
            return;
        }
        cveNode = new SourceCodeCveTreeNode(cve, [cveNodeDetails], fileNode, severity);
        root.applicableCves.set(cve, cveNode);
    }

    public isFileScanned(file: string): boolean {
        return this.fileToNode.has(file) || false;
    }

    public isCveApplicable(workspace: string, cve: string): boolean {
        return this.workspaceToTree.get(workspace)?.isCveApplicable(cve) || false;
    }

    public getApplicableCve(workspace: string, cve: string): SourceCodeCveTreeNode | undefined {
        return this.workspaceToTree.get(workspace)?.applicableCves.get(cve);
    }

    public isCveNotApplicable(workspace: string, cve: string): boolean {
        return this.workspaceToTree.get(workspace)?.isCveNotApplicable(cve) || false;
    }

    public getFileTreeNode(file: string): SourceCodeFileTreeNode | undefined {
        if (!this.isFileScanned(file)) {
            return undefined;
        }
        return this.fileToNode.get(file);
    }

    /**
     * Return a map of 'workspace' -> 'CveApplicabilityTree'
     */
    public getScannedProjects(): Map<string, SourceCodeRootTreeNode> {
        return this.workspaceToTree;
    }

    getTreeItem(
        element: SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        if (element instanceof SourceCodeRootTreeNode) {
            element.iconPath = PackageDescriptorUtils.getIcon(element.projectType);
            return element;
        }
        if (element instanceof SourceCodeFileTreeNode) {
            element.iconPath = SeverityUtils.getIcon(element.topSeverity !== undefined ? element.topSeverity : Severity.Unknown);
            return element;
        }
        if (element instanceof SourceCodeCveTreeNode) {
            element.command = Utils.createNodeCommand('jfrog.source.code.scan.jumpToSource', 'Show in source code', [element]);
            element.iconPath = SeverityUtils.getIcon(element.severity !== undefined ? element.severity : Severity.Unknown);
            return element;
        }
        if (element instanceof TreeDataHolder) {
            let holder: TreeDataHolder = <TreeDataHolder>element;
            let treeItem: vscode.TreeItem = new vscode.TreeItem(holder.key);
            treeItem.description = holder.value;
            treeItem.contextValue = holder.context;
            treeItem.command = holder.command;
            if (holder.link) {
                treeItem.command = {
                    command: 'vscode.open',
                    arguments: [vscode.Uri.parse(holder.link)]
                } as vscode.Command;
            }
            return treeItem;
        }
        return element;
    }

    public getParent(
        element: SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode
    ): Thenable<SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot | undefined> {
        return Promise.resolve(element.parent);
    }

    getChildren(
        element?: SourceCodeRootTreeNode | SourceCodeFileTreeNode | SourceCodeCveTreeNode | CveApplicabilityRoot
    ): vscode.ProviderResult<any> {
        if (element instanceof CveApplicabilityRoot) {
            if (element.children.length === 1) {
                return Promise.resolve(element.children[0].children);
            }
        }
        if (element) {
            return Promise.resolve(element.children);
        }
        this._cveApplicabilityRoot = this.getApplicableFiles();
        return Promise.resolve([this._cveApplicabilityRoot]);
    }

    private getApplicableFiles(): CveApplicabilityRoot | undefined {
        const projects: Map<string, SourceCodeRootTreeNode> = this.getScannedProjects();
        if (projects.size === 0) {
            return undefined;
        }
        let sourceCodeRootTreeNodes: SourceCodeRootTreeNode[] = [];
        const cveApplicabilityRoot: CveApplicabilityRoot = new CveApplicabilityRoot(
            sourceCodeRootTreeNodes,
            vscode.TreeItemCollapsibleState.Expanded
        );
        for (let files of projects.values()) {
            files.parent = cveApplicabilityRoot;
            if (files.children.length === 0) {
                files.children.push(SourceCodeFileTreeNode.createNoVulnerabilitiesFound());
            }
            sourceCodeRootTreeNodes.push(files);
        }
        return cveApplicabilityRoot.children.length > 0 ? cveApplicabilityRoot : undefined;
    }

    public onChangeFire(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    private clearCveTreeView() {
        this.fileToNode = new Map<string, SourceCodeFileTreeNode>();
        this.workspaceToTree = new Map<string, SourceCodeRootTreeNode>();
    }

    public async refresh() {
        this.clearCveTreeView();
        const version: string | undefined = this._treesManager.sourceCodeTreeDataProvider._cveApplicabilityRunner.version();
        if (version == undefined) {
            return;
        }
        this._treesManager.logManager.logMessage("Running CVE Applicability version '" + version.trim() + "'", 'INFO');
        await this._treesManager.sourceCodeTreeDataProvider.scanProjects();
        this.onChangeFire();
    }
}
