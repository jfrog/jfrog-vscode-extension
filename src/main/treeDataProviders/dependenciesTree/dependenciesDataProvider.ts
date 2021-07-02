import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails, IArtifact, IGeneral, IIssue, ILicense } from 'jfrog-client-js';
import { GeneralInfo } from '../../types/generalInfo';
import { Issue } from '../../types/issue';
import { License } from '../../types/license';
import { Scope } from '../../types/scope';
import { Severity, SeverityUtils } from '../../types/severity';
import { MavenUtils } from '../../utils/mavenUtils';
import { ScanUtils } from '../../utils/scanUtils';
import { Translators } from '../../utils/translators';
import { TreesManager } from '../treesManager';
import { RootNode } from './dependenciesRoot/rootTree';
import { DependenciesTreesFactory } from './dependenciesTreeFactory';
import { DependenciesTreeNode } from './dependenciesTreeNode';

export class DependenciesTreeDataProvider implements vscode.TreeDataProvider<DependenciesTreeNode> {
    private static readonly CANCELLATION_ERROR: Error = new Error('Xray Scan cancelled');

    private _filterLicenses: Collections.Set<License> = new Collections.Set(license => license.fullName);
    private _filterScopes: Collections.Set<Scope> = new Collections.Set(scope => scope.label);
    private _componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
    private _filteredDependenciesTree: DependenciesTreeNode | undefined;
    protected _dependenciesTree!: DependenciesTreeNode;
    private _scanInProgress: boolean = false;

    constructor(protected _workspaceFolders: vscode.WorkspaceFolder[], protected _treesManager: TreesManager) {}

    public get dependenciesTree() {
        return this._dependenciesTree;
    }

    public async stateChange(onChangeFire: () => void) {
        if (!this.dependenciesTree) {
            this.refresh(false, onChangeFire);
            return;
        }
        onChangeFire();
    }

    public async refresh(quickScan: boolean, onChangeFire: () => void) {
        if (this._scanInProgress) {
            if (!quickScan) {
                vscode.window.showInformationMessage('Previous scan still running...');
            }
            return;
        }
        try {
            this._scanInProgress = true;
            const credentialsSet: boolean = this._treesManager.connectionManager.areXrayCredentialsSet();
            this._treesManager.logManager.logMessage('Starting ' + (quickScan ? 'quick' : 'slow') + ' scan', 'INFO');
            await this.repopulateTree(quickScan, credentialsSet, onChangeFire);
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

    public getTreeItem(element: DependenciesTreeNode): vscode.TreeItem {
        element.command = {
            command: 'jfrog.xray.focus',
            title: '',
            arguments: [element]
        };
        let topIssue: Issue = element.topIssue;
        element.iconPath = SeverityUtils.getIcon(topIssue ? topIssue.severity : Severity.Normal);
        return element;
    }

    public getChildren(element?: DependenciesTreeNode): Thenable<DependenciesTreeNode[]> {
        if (!this.dependenciesTree) {
            return Promise.resolve([]);
        }
        if (element) {
            return Promise.resolve(element.children);
        }
        let rootChildren: DependenciesTreeNode[] = this._filteredDependenciesTree
            ? this._filteredDependenciesTree.children
            : this.dependenciesTree.children;
        return Promise.resolve(rootChildren.length === 1 ? rootChildren[0].children : rootChildren);
    }

    public getParent(element: DependenciesTreeNode): Thenable<DependenciesTreeNode | undefined> {
        return Promise.resolve(element.parent);
    }

    public applyFilters(filteredDependenciesTree: DependenciesTreeNode | undefined, onChangeFire: () => void) {
        this._filteredDependenciesTree = filteredDependenciesTree;
        onChangeFire();
    }

    public removeNode(node: DependenciesTreeNode, onChangeFire: () => void) {
        let nodeIndex: number | undefined = node.parent?.children.indexOf(node);
        if (nodeIndex === undefined || nodeIndex < 0) {
            return;
        }
        node.parent?.children.splice(nodeIndex, 1);
        this.refresh(true, onChangeFire);
    }

    private async scanAndCacheComponents(progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) {
        const totalComponents: number = this._componentsToScan.size();
        if (totalComponents === 0) {
            return;
        }
        progress.report({ message: `${totalComponents} components` });
        await this.scanAndCache(progress, checkCanceled, totalComponents, this._componentsToScan.toArray());
    }

    private async scanAndCache(
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        checkCanceled: () => void,
        totalComponents: number,
        componentDetails: ComponentDetails[]
    ) {
        try {
            checkCanceled();
            let step: number = (100 / totalComponents) * 100;
            for (let currentIndex: number = 0; currentIndex < componentDetails.length; currentIndex += 100) {
                let partialComponents: ComponentDetails[] = componentDetails.slice(currentIndex, currentIndex + 100);
                let artifacts: IArtifact[] = await this._treesManager.connectionManager.getComponents(partialComponents);
                this.addMissingXrayComponents(partialComponents, artifacts);
                await this._treesManager.scanCacheManager.addArtifactComponents(artifacts);
                progress.report({ message: `${totalComponents} components`, increment: step });
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
                child.generalInfo.update(Translators.toGeneralInfo(artifact.general));
                if (!child.generalInfo.pkgType) {
                    child.generalInfo.pkgType = pkgType;
                }
                artifact.issues.map(Translators.toIssue).forEach(issue => child.issues.add(issue));
                artifact.licenses.map(Translators.toLicense).forEach(license => child.licenses.add(license));
                this.filterLicenses.union(child.licenses);
                generalInfo.scopes.map(scope => this.filterScopes.add(new Scope(scope)));
            }
            this.addXrayInfoToTree(child);
        });
    }

    private async repopulateTree(quickScan: boolean, credentialsSet: boolean, onChangeFire: () => void) {
        await ScanUtils.scanWithProgress(async (progress: vscode.Progress<{ message?: string; increment?: number }>, checkCanceled: () => void) => {
            this.clearTree();
            let workspaceRoot: DependenciesTreeNode = <DependenciesTreeNode>this.dependenciesTree;
            await DependenciesTreesFactory.createDependenciesTrees(
                this._workspaceFolders,
                this._componentsToScan,
                this._treesManager,
                workspaceRoot,
                quickScan
            );
            if (credentialsSet) {
                await this.scanAndCacheComponents(progress, checkCanceled);
                for (let dependenciesTreeNode of workspaceRoot.children) {
                    this.addXrayInfoToTree(dependenciesTreeNode);
                    dependenciesTreeNode.issues = dependenciesTreeNode.processTreeIssues();
                }
                workspaceRoot.children.forEach(node => {
                    if (node instanceof RootNode) {
                        node.setUpgradableDependencies();
                    }
                });
            }
            onChangeFire();
        }, 'Scanning project dependencies ');
    }

    private clearTree() {
        this._filteredDependenciesTree = undefined;
        let generalInfo: GeneralInfo = new GeneralInfo('', '', [], '', '');
        this._dependenciesTree = new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.Expanded);
    }

    public get filterLicenses(): Collections.Set<License> {
        return this._filterLicenses;
    }

    public get filterScopes(): Collections.Set<Scope> {
        return this._filterScopes;
    }

    private addMissingXrayComponents(partialComponents: ComponentDetails[], artifacts: IArtifact[]) {
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
