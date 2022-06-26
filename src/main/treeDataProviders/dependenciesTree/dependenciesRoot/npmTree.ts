import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { TreesManager } from '../../treesManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { NpmGlobalScopes, ScopedNpmProject, NpmUtils } from '../../../utils/npmUtils';
import { RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';

export class NpmTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(workspaceFolder: string, private _treesManager: TreesManager, parent?: DependenciesTreeNode) {
        super(workspaceFolder, PackageType.NPM, parent);
    }

    public async refreshDependencies(quickScan: boolean) {
        const productionScope: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.PRODUCTION);
        const developmentScope: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.DEVELOPMENT);
        let npmLsFailed: boolean = false;
        [productionScope, developmentScope].forEach(scopedProject => {
            try {
                scopedProject.loadProjectDetails(NpmUtils.runNpmLs(scopedProject.scope, this.workspaceFolder));
            } catch (error) {
                this._treesManager.logManager.logError(<any>error, !quickScan);
                this._treesManager.logManager.logMessage(
                    'Possible cause: The project needs to be installed by npm. Install it by running "npm install" from "' +
                        this.workspaceFolder +
                        '".',
                    'INFO'
                );
                scopedProject.loadProjectDetailsFromFile(path.join(this.workspaceFolder, 'package.json'));
                npmLsFailed = true;
                return;
            }
            this.populateDependenciesTree(this, scopedProject.dependencies, quickScan, scopedProject.scope);
        });
        this.generalInfo = new GeneralInfo(
            npmLsFailed ? (productionScope.projectName += ' [Not installed]') : productionScope.projectName,
            productionScope.projectVersion,
            [],
            this.workspaceFolder,
            NpmUtils.PKG_TYPE
        );
        this.projectDetails.name = productionScope.projectName ? productionScope.projectName : path.join(this.workspaceFolder, 'package.json');
        this.label = this.projectDetails.name;
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any, quickScan: boolean, globalScope: string) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let version: string = dependency.version;
            if (version) {
                let childDependencies: any = dependency.dependencies;
                const scope: string = NpmUtils.getDependencyScope(key);
                const currentDependencyScope: string[] = scope !== '' ? [globalScope, scope] : [globalScope];
                let generalInfo: GeneralInfo = new GeneralInfo(key, version, currentDependencyScope, '', NpmUtils.PKG_TYPE);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState = childDependencies
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode);
                let componentId: string = key + ':' + version;
                if (!quickScan || !this._treesManager.scanCacheManager.isValid(componentId)) {
                    this.projectDetails.addDependency(NpmTreeNode.COMPONENT_PREFIX + componentId);
                }
                this.populateDependenciesTree(child, childDependencies, quickScan, globalScope);
            }
        }
    }
}
