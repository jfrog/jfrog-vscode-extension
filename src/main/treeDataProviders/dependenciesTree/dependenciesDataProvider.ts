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
import { MavenUtils } from '../../utils/mavenUtils';
import { IComponentMetadata } from '../../goCenterClient/model/ComponentMetadata';
import { GoDependenciesTreeNode } from './goDependenciesTreeNode';
import { GoTreeNode } from './dependenciesRoot/goTree';

export class DependenciesTreeDataProvider implements vscode.TreeDataProvider<DependenciesTreeNode | SetCredentialsNode> {
    private static readonly CANCELLATION_ERROR: Error = new Error('Xray Scan cancelled');

    private _onDidChangeTreeData: vscode.EventEmitter<DependenciesTreeNode | SetCredentialsNode | undefined> = new vscode.EventEmitter<
        DependenciesTreeNode | SetCredentialsNode | undefined
    >();
    readonly onDidChangeTreeData: vscode.Event<DependenciesTreeNode | SetCredentialsNode | undefined> = this._onDidChangeTreeData.event;
    private _filterLicenses: Collections.Set<License> = new Collections.Set(license => license.fullName);
    private _componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
    private _goCenterComponentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
    private _filteredDependenciesTree: DependenciesTreeNode | undefined;
    protected _dependenciesTree!: DependenciesTreeNode | SetCredentialsNode;
    private _scanInProgress: boolean = false;

    constructor(protected _workspaceFolders: vscode.WorkspaceFolder[], protected _treesManager: TreesManager) {}

    public get dependenciesTree() {
        return this._dependenciesTree;
    }

    public async refresh(quickScan: boolean) {
        if (this._scanInProgress) {
            if (!quickScan) {
                vscode.window.showInformationMessage('Previous scan still running...');
            }
            return;
        }
        try {
            this._scanInProgress = true;
            const credentialsSet: boolean = this._treesManager.connectionManager.areCredentialsSet();
            this._treesManager.logManager.logMessage('Starting ' + (quickScan ? 'quick' : 'slow'), 'INFO');
            if (!credentialsSet) {
                this._treesManager.logManager.logMessage(' Xray scan...', 'INFO');
            } else {
                this._treesManager.logManager.logMessage(' GoCenter scan...', 'INFO');
            }
            await this.repopulateTree(quickScan, credentialsSet);
            vscode.commands.executeCommand('jfrog.xray.focus');
            this._treesManager.logManager.setSuccess();
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

    private async scanAndCacheComponents(progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) {
        const totalComponents: number = this._componentsToScan.size() + this._goCenterComponentsToScan.size() || 1;
        progress.report({ message: 0 + '/' + totalComponents + ' components scanned' });
        await Promise.all([
            await this.xrayScanAndCache(progress, checkCanceled, totalComponents),
            await this.goCenterScanAndCache(progress, checkCanceled, totalComponents)
        ]);
    }

    private async xrayScanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void,
        totalComponents: number
    ) {
        try {
            checkCanceled();
            let componentDetails: ComponentDetails[] = this._componentsToScan.toArray();
            let step: number = (100 / totalComponents) * 100;
            for (let currentIndex: number = 0; currentIndex < componentDetails.length; currentIndex += 100) {
                let partialComponents: ComponentDetails[] = componentDetails.slice(currentIndex, currentIndex + 100);
                let artifacts: IArtifact[] = await this._treesManager.connectionManager.getComponents(partialComponents);
                this.addMissingComponents(partialComponents, artifacts);
                await this._treesManager.scanCacheManager.addIArtifactComponents(artifacts);
                progress.report({ message: currentIndex + 100 + '/' + totalComponents + ' components scanned', increment: step });
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

    private async goCenterScanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void,
        totalComponents: number
    ) {
        try {
            checkCanceled();
            let componentDetails: ComponentDetails[] = this._goCenterComponentsToScan.toArray();
            let step: number = (100 / totalComponents) * 100;
            for (let currentIndex: number = 0; currentIndex < componentDetails.length; currentIndex += 100) {
                let partialComponents: ComponentDetails[] = componentDetails.slice(currentIndex, currentIndex + 100);
                let module: IComponentMetadata[] = await this._treesManager.connectionManager.getGoCenterModules(partialComponents);
                await this._treesManager.scanCacheManager.addIMetadataComponents(module);
                progress.report({ message: currentIndex + 100 + '/' + totalComponents + ' GoCenter modules scanned', increment: step });
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

    public addXrayInfoToTree(root: DependenciesTreeNode) {
        root.children.forEach(child => {
            let generalInfo: GeneralInfo = child.generalInfo;
            let artifact: IArtifact | undefined = this._treesManager.scanCacheManager.getArtifact(generalInfo.getComponentId());
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

    public addGoCenterInfoToTree(root: DependenciesTreeNode, credentialsSet: boolean) {
        root.children.forEach(child => {
            if (child instanceof GoDependenciesTreeNode) {
                let componentMetadata: IComponentMetadata | undefined = this._treesManager.scanCacheManager.getMetadata(
                    child.getGoCenterComponentId()
                );
                if (componentMetadata) {
                    // Use xray issue instead of GoCenter
                    if (!credentialsSet) {
                        if (componentMetadata.vulnerabilities.severity) {
                            Translators.severityCountToIssues(componentMetadata.vulnerabilities.severity).forEach(issue => child.issues.add(issue));
                        }
                        if (componentMetadata.licenses) {
                            componentMetadata.licenses.map(Translators.stringToLicense).forEach(license => child.licenses.add(license));
                            this.filterLicenses.union(child.licenses);
                        }
                    }
                    // Load GoCenter info(e.g. readme url) to each go node
                    child.componentMetadata = componentMetadata;
                }
                this.addGoCenterInfoToTree(child, credentialsSet);
            }
        });
    }

    private async repopulateTree(quickScan: boolean, credentialsSet: boolean) {
        await ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
            this.clearTree();
            let dependenciesTree: DependenciesTreeNode = <DependenciesTreeNode>this.dependenciesTree;
            await DependenciesTreesFactory.createDependenciesTrees(
                this._workspaceFolders,
                this._componentsToScan,
                this._goCenterComponentsToScan,
                this._treesManager,
                dependenciesTree,
                quickScan
            );
            if (credentialsSet) {
                // Xray + GoCenter users
                await this.scanAndCacheComponents(progress, checkCanceled);
                for (let dependenciesTreeNode of dependenciesTree.children) {
                    this.addXrayInfoToTree(dependenciesTreeNode);
                    if (dependenciesTreeNode instanceof GoTreeNode) {
                        this.addGoCenterInfoToTree(dependenciesTreeNode, credentialsSet);
                    }
                    dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
                }
            } else {
                // GoCenter users
                const totalComponents: number = this._goCenterComponentsToScan.size();
                vscode.window.showInformationMessage('Xray server is not configured.');
                progress.report({ message: 0 + '/' + totalComponents + ' components scanned' });
                await this.goCenterScanAndCache(progress, checkCanceled, totalComponents);
                for (let dependenciesTreeNode of dependenciesTree.children) {
                    this.addGoCenterInfoToTree(dependenciesTreeNode, credentialsSet);
                    dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
                }
            }
            this._onDidChangeTreeData.fire();
        }, credentialsSet);
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
        if (!(this.dependenciesTree instanceof DependenciesTreeNode) && !(this.dependenciesTree instanceof GoDependenciesTreeNode)) {
            return undefined;
        }
        // Unlike other build tools, which rely that each direct dep can be found in the root's child, Maven can have direct dep in each node because,
        // Maven has parent pom which is the root of the tree all the other poms are located beneath it.
        // In order to solve this, we create a map  (fs-path -> node) find the correct pom in the tree.
        if (pkgType === 'maven') {
            return MavenUtils.pathToNode.get(path || '');
        }
        let root: DependenciesTreeNode = this._filteredDependenciesTree || this.dependenciesTree;
        for (let dependenciesTree of root.children) {
            let generalInfo: GeneralInfo = dependenciesTree.generalInfo;
            if (generalInfo.pkgType === pkgType && (!path || generalInfo.path === path)) {
                return dependenciesTree;
            }
        }
        return undefined;
    }
}
