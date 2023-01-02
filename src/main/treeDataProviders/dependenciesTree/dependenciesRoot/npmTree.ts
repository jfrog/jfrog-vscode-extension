import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { TreesManager } from '../../treesManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { NpmGlobalScopes, ScopedNpmProject, NpmUtils } from '../../../utils/npmUtils';
import { RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';
import { Severity } from '../../../types/severity';

export class NpmTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(workspaceFolder: string, private _treesManager: TreesManager, parent?: DependenciesTreeNode) {
        super(workspaceFolder, PackageType.Npm, parent);
    }

    public async refreshDependencies() {
        const productionScope: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.PRODUCTION);
        const developmentScope: ScopedNpmProject = new ScopedNpmProject(NpmGlobalScopes.DEVELOPMENT);
        let npmLsFailed: boolean = false;
        [productionScope, developmentScope].forEach(scopedProject => {
            try {
                scopedProject.loadProjectDetails(NpmUtils.runNpmLs(scopedProject.scope, this.workspaceFolder));
            } catch (error) {
                this._treesManager.logManager.logError(<any>error, false);
                scopedProject.loadProjectDetailsFromFile(path.join(this.workspaceFolder, 'package.json'));
                npmLsFailed = true;
            }
            this.populateDependenciesTree(this, scopedProject.dependencies, scopedProject.scope);
        });
        if (npmLsFailed) {
            this._treesManager.logManager.logMessageAndToastErr(
                `Failed to scan npm project. Hint: Please make sure the commands 'npm install' or 'npm ci' run successfully in '${this.workspaceFolder}'`,
                'ERR'
            );
        }
        this.generalInfo = new GeneralInfo(
            npmLsFailed ? (productionScope.projectName += ' [Not installed]') : productionScope.projectName,
            productionScope.projectVersion,
            [],
            this.workspaceFolder,
            NpmUtils.PKG_TYPE
        );
        if (npmLsFailed) {
            this.topSeverity = Severity.Unknown;
        }
        this.projectDetails.name = productionScope.projectName ? productionScope.projectName : path.join(this.workspaceFolder, 'package.json');
        this.label = this.projectDetails.name;
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any, globalScope: string) {
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
                this.projectDetails.addDependency(NpmTreeNode.COMPONENT_PREFIX + componentId);
                child.dependencyId = NpmTreeNode.COMPONENT_PREFIX + componentId;
                this.populateDependenciesTree(child, childDependencies, globalScope);
            }
        }
    }
}
