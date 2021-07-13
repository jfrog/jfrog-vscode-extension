import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'jfrog-client-js';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { TreesManager } from '../../treesManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { ScanUtils } from '../../../utils/scanUtils';
import { NpmGlobalScopes, ScopedNpmProject, NpmUtils } from '../../../utils/npmUtils';
import { RootNode } from './rootTree';

export class NpmTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(
        workspaceFolder: string,
        private _componentsToScan: Collections.Set<ComponentDetails>,
        private _treesManager: TreesManager,
        parent?: DependenciesTreeNode
    ) {
        super(workspaceFolder, parent);
    }

    public async refreshDependencies(quickScan: boolean) {
        const productionScope: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.PRODUCTION);
        const developmentScope: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.DEVELOPMENT);
        let npmLsFailed: boolean = false;
        [productionScope, developmentScope].forEach(scopedProject => {
            try {
                scopedProject.loadProjectDetails(this.runNpmLs(scopedProject.scope));
            } catch (error) {
                this._treesManager.logManager.logError(error, !quickScan);
                this._treesManager.logManager.logMessage(
                    'Possible cause: The project needs to be installed by npm. Install it by running "npm install" from "' +
                        this.workspaceFolder +
                        '",.',
                    'INFO'
                );
                scopedProject.loadProjectDetails(JSON.parse(error.stdout.toString()));
                npmLsFailed = true;
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
        this.label = productionScope.projectName ? productionScope.projectName : path.join(this.workspaceFolder, 'package.json');
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
                if (!quickScan || !this._treesManager.scanCacheManager.validateOrDelete(componentId)) {
                    this._componentsToScan.add(new ComponentDetails(NpmTreeNode.COMPONENT_PREFIX + componentId));
                }
                this.populateDependenciesTree(child, childDependencies, quickScan, globalScope);
            }
        }
    }

    private runNpmLs(scope: NpmGlobalScopes): any {
        return JSON.parse(ScanUtils.executeCmd('npm ls --json --all --only=' + scope, this.workspaceFolder).toString());
    }
}
