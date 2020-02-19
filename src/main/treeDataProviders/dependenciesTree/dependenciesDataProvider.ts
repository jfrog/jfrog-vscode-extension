import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails, IArtifact, IGeneral, IIssue, ILicense } from 'xray-client-js';
import { GeneralInfo } from '../../types/generalInfo';
import { Issue } from '../../types/issue';
import { License } from '../../types/license';
import { Severity, SeverityUtils } from '../../types/severity';
import { ScanUtils } from '../../utils/scanUtils';
import { Translators } from '../../utils/translators';
import { TreesManager } from '../treesManager';
import { SetCredentialsNode } from '../utils/setCredentialsNode';
import { DependenciesTreesFactory } from './dependenciesTreeFactory';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { GavGeneralInfo } from '../../types/gavGeneralinfo';
import { MavenUtils } from '../../utils/mavenUtils';

export class DependenciesTreeDataProvider implements vscode.TreeDataProvider<DependenciesTreeNode | SetCredentialsNode> {
    private static readonly CANCELLATION_ERROR: Error = new Error('Xray Scan cancelled');

    private _onDidChangeTreeData: vscode.EventEmitter<DependenciesTreeNode | SetCredentialsNode | undefined> = new vscode.EventEmitter<
        DependenciesTreeNode | SetCredentialsNode | undefined
    >();
    readonly onDidChangeTreeData: vscode.Event<DependenciesTreeNode | SetCredentialsNode | undefined> = this._onDidChangeTreeData.event;
    private _filterLicenses: Collections.Set<License> = new Collections.Set(license => license.fullName);
    private _componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
    private _filteredDependenciesTree: DependenciesTreeNode | undefined;
    protected _dependenciesTree!: DependenciesTreeNode | SetCredentialsNode;
    private _scanInProgress: boolean = false;

    constructor(protected _workspaceFolders: vscode.WorkspaceFolder[], protected _treesManager: TreesManager) {}

    public get dependenciesTree() {
        return this._dependenciesTree;
    }

    public async refresh(quickScan: boolean) {
        if (!this._treesManager.connectionManager.areCredentialsSet()) {
            if (!quickScan) {
                vscode.window.showErrorMessage('Xray server is not configured.');
            }
            this.clearTree();
            this._dependenciesTree = new SetCredentialsNode();
            this._onDidChangeTreeData.fire();
            return;
        }
        if (this._scanInProgress) {
            if (!quickScan) {
                vscode.window.showInformationMessage('Previous scan still running...');
            }
            return;
        }
        try {
            this._scanInProgress = true;
            this._treesManager.logManager.logMessage('Starting ' + (quickScan ? 'quick' : 'slow') + ' Xray scan...', 'INFO');
            await this.repopulateTree(quickScan);
            vscode.commands.executeCommand('jfrog.xray.focus');
        } catch (error) {
            if (error.message !== DependenciesTreeDataProvider.CANCELLATION_ERROR.message) {
                // Unexpected error
                throw error;
            }
            this.clearTree();
            vscode.window.showInformationMessage(error.message);
        } finally {
            this._scanInProgress = false;
        }
    }

    getTreeItem(element: DependenciesTreeNode): vscode.TreeItem {
        element.command = {
            command: 'jfrog.xray.focus',
            title: '',
            arguments: [element]
        };
        let topIssue: Issue = element.topIssue;
        element.iconPath = SeverityUtils.getIcon(topIssue ? topIssue.severity : Severity.Normal);
        return element;
    }

    getChildren(element?: DependenciesTreeNode): Thenable<DependenciesTreeNode[] | SetCredentialsNode[]> {
        if (!this.dependenciesTree) {
            return Promise.resolve([]);
        }
        if (element) {
            return Promise.resolve(element.children);
        }
        if (this.dependenciesTree instanceof SetCredentialsNode) {
            return Promise.resolve([this.dependenciesTree]);
        }
        let rootChildren: DependenciesTreeNode[] = this._filteredDependenciesTree
            ? this._filteredDependenciesTree.children
            : this.dependenciesTree.children;
        return Promise.resolve(rootChildren.length === 1 ? rootChildren[0].children : rootChildren);
    }

    getParent(element: DependenciesTreeNode): Thenable<DependenciesTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    public applyFilters(filteredDependenciesTree: DependenciesTreeNode | undefined) {
        this._filteredDependenciesTree = filteredDependenciesTree;
        this._onDidChangeTreeData.fire();
    }

    private async scanAndCacheArtifact(progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) {
        try {
            checkCanceled();
            let componentDetails: ComponentDetails[] = this._componentsToScan.toArray();
            let step: number = (100 / componentDetails.length) * 100;
            progress.report({ message: 0 + '/' + componentDetails.length + ' components scanned' });
            for (let currentIndex: number = 0; currentIndex < componentDetails.length; currentIndex += 100) {
                let partialComponents: ComponentDetails[] = componentDetails.slice(currentIndex, currentIndex + 100);
                let artifacts: IArtifact[] = await this._treesManager.connectionManager.getComponents(partialComponents);
                this.addMissingComponents(partialComponents, artifacts);
                await this._treesManager.scanCacheManager.addComponents(artifacts);
                progress.report({ message: currentIndex + 100 + '/' + componentDetails.length + ' components scanned', increment: step });
                checkCanceled();
            }
        } catch (error) {
            if (error.message === DependenciesTreeDataProvider.CANCELLATION_ERROR.message) {
                // If it's not a cancellation error, throw it up
                throw error;
            }
            vscode.window.showErrorMessage(error.toString());
        }
    }

    private addXrayInfoToTree(root: DependenciesTreeNode) {
        root.children.forEach(child => {
            let generalInfo: GeneralInfo | GavGeneralInfo = child.generalInfo;
            let artifact: IArtifact | undefined = this._treesManager.scanCacheManager.get(generalInfo.getComponentId());
            if (artifact) {
                let pkgType: string = child.generalInfo.pkgType;
                child.generalInfo = Translators.toGeneralInfo(artifact.general);
                if (!child.generalInfo.pkgType) {
                    child.generalInfo.pkgType = pkgType;
                }
                artifact.issues.map(Translators.toIssue).forEach(issue => child.issues.add(issue));
                artifact.licenses.map(Translators.toLicense).forEach(license => child.licenses.add(license));
                this.filterLicenses.union(child.licenses);
            }
            this.addXrayInfoToTree(child);
        });
    }

    private async repopulateTree(quickScan: boolean) {
        await ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
            this.clearTree();
            let dependenciesTree: DependenciesTreeNode = <DependenciesTreeNode>this.dependenciesTree;
            await DependenciesTreesFactory.createDependenciesTrees(
                this._workspaceFolders,
                progress,
                this._componentsToScan,
                this._treesManager,
                dependenciesTree,
                quickScan
            );
            await this.scanAndCacheArtifact(progress, checkCanceled);
            for (let dependenciesTreeNode of dependenciesTree.children) {
                this.addXrayInfoToTree(dependenciesTreeNode);
                dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
            }
            this._onDidChangeTreeData.fire();
        });
    }

    private clearTree() {
        this._filteredDependenciesTree = undefined;
        let generalInfo: GeneralInfo = new GeneralInfo('', '', '', '');
        this._dependenciesTree = new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.Expanded);
    }

    public get filterLicenses(): Collections.Set<License> {
        return this._filterLicenses;
    }

    private addMissingComponents(partialComponents: ComponentDetails[], artifacts: IArtifact[]) {
        if (artifacts.length === partialComponents.length) {
            return;
        }
        let missingComponents: Collections.Set<string> = new Collections.Set<string>();
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
                issues: [<IIssue>{ summary: Issue.MISSING_COMPONENT.summary, severity: Issue.MISSING_COMPONENT.severity.toString() }],
                licenses: [<ILicense>{ name: License.UNKNOWN_LICENSE, full_name: License.UNKNOWN_LICENSE_FULL_NAME }]
            });
        });
    }

    public getDependenciesTreeNode(pkgType: string, path?: string): DependenciesTreeNode | undefined {
        if (!(this.dependenciesTree instanceof DependenciesTreeNode)) {
            return undefined;
        }
        if (pkgType === 'maven') {
            return MavenUtils.pathToNode.get(path || '');
        }
        let root: DependenciesTreeNode = this._filteredDependenciesTree || this.dependenciesTree;
        for (let dependenciesTree of root.children) {
            let generalInfo: GeneralInfo | GavGeneralInfo = dependenciesTree.generalInfo;
            if (generalInfo.pkgType === pkgType && (!path || generalInfo.path === path)) {
                return dependenciesTree;
            }
        }
        return undefined;
    }
}
