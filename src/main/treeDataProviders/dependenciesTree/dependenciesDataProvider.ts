import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails, IArtifact, IGeneral, IIssue, ILicense } from 'xray-client-js';
import { ConnectionManager } from '../../connect/connectionManager';
import { ScanCacheManager } from '../../scanCache/scanCacheManager';
import { GeneralInfo } from '../../types/generalInfo';
import { Issue } from '../../types/issue';
import { License } from '../../types/license';
import { Severity, SeverityUtils } from '../../types/severity';
import { NpmUtils } from '../../utils/npmUtils';
import { ScanUtils } from '../../utils/scanUtils';
import { Translators } from '../../utils/translators';
import { DependenciesTreeNode } from './dependenciesTreeNode';
import { SetCredentialsNode } from '../utils/setCredentialsNode';

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

    constructor(
        protected _workspaceFolders: vscode.WorkspaceFolder[],
        protected _connectionManager: ConnectionManager,
        protected _scanCacheManager: ScanCacheManager
    ) {}

    public get dependenciesTree() {
        return this._dependenciesTree;
    }

    public async refresh(quickScan: boolean) {
        if (!this._connectionManager.areCredentialsSet()) {
            if (!quickScan) {
                vscode.window.showErrorMessage('Xray server is not configured.');
            }
            this.clearTree();
            this._dependenciesTree = new SetCredentialsNode();
            this._onDidChangeTreeData.fire();
            return;
        }
        if (this._scanInProgress) {
            vscode.window.showInformationMessage('Previous scan still running...');
            return;
        }
        try {
            this._scanInProgress = true;
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
                let artifacts: IArtifact[] = await this._connectionManager.getComponents(partialComponents);
                this.addMissingComponents(partialComponents, artifacts);
                await this._scanCacheManager.addComponents(artifacts);
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
            let generalInfo: GeneralInfo = child.generalInfo;
            let artifact: IArtifact | undefined = this._scanCacheManager.get(generalInfo.artifactId + ':' + generalInfo.version);
            if (artifact) {
                child.generalInfo = Translators.toGeneralInfo(artifact.general);
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
            await NpmUtils.createNpmDependenciesTrees(
                this._workspaceFolders,
                progress,
                this._componentsToScan,
                this._scanCacheManager,
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
                general: <IGeneral>{ component_id: missingComponent, pkg_type: 'npm' },
                issues: [<IIssue>{ summary: 'Component is missing in Xray', severity: 'Unknown', issue_type: 'Unknown' }],
                licenses: [<ILicense>{ name: License.UNKNOWN_LICENSE, full_name: License.UNKNOWN_LICENSE_FULL_NAME }]
            });
        });
    }

    public getDependenciesTreeNode(pkgType: string, path: string): DependenciesTreeNode | undefined {
        if (!(this.dependenciesTree instanceof DependenciesTreeNode)) {
            return undefined;
        }
        let root: DependenciesTreeNode = this._filteredDependenciesTree || this.dependenciesTree;
        for (let dependenciesTree of root.children) {
            let generalInfo: GeneralInfo = dependenciesTree.generalInfo;
            if (generalInfo.pkgType === pkgType && generalInfo.path === path) {
                return dependenciesTree;
            }
        }
        return undefined;
    }
}
