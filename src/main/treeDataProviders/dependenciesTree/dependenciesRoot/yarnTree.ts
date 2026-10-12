import * as path from 'path';
import * as vscode from 'vscode';
import { GeneralInfo } from '../../../types/generalInfo';
import { NpmUtils, ProjectDetails } from '../../../utils/npmUtils';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { BuildTreeErrorType, RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';
import { LogManager } from '../../../log/logManager';
import { IImpactGraph } from 'jfrog-ide-webview';
import { YarnDependency, YarnStrategy } from '../../../utils/yarn/yarnStrategy';

export class YarnTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(workspaceFolder: string, private _logManager: LogManager, parent?: DependenciesTreeNode) {
        super(workspaceFolder, PackageType.Yarn, parent);
    }

    private _strategy?: YarnStrategy;

    public loadYarnDependencies(strategy: YarnStrategy) {
        this._strategy = strategy;
        try {
            for (let dependency of strategy.listDependencies(this.workspaceFolder)) {
                this.addDependency(this, dependency);
            }
        } catch (error) {
            this._logManager.logError(<any>error, false);
            this._logManager.logMessageAndToastErr(
                `Failed to scan Yarn project. Hint: Please make sure the command "yarn install" runs successfully in ` + this.workspaceFolder + '".',
                'ERR'
            );
            this.buildError = BuildTreeErrorType.NotInstalled;
        }

        const yarnProject: ProjectDetails = NpmUtils.getProjectDetailsFromPackageJson(this.workspaceFolder);
        this.generalInfo = new GeneralInfo(yarnProject.projectName, yarnProject.projectVersion, [], this.workspaceFolder, PackageType.Yarn);
        this.projectDetails.name = yarnProject.projectName || path.join(this.workspaceFolder, 'yarn.lock');
        this.label = this.projectDetails.name;
    }

    /** @override */
    public createImpactedGraph(name: string, version: string): IImpactGraph {
        if (!this._strategy) {
            return super.createImpactedGraph(name, version);
        }
        return this._strategy.createImpactGraph(name, version, this.generalInfo.getComponentId(), this.workspaceFolder, this._logManager);
    }

    private addDependency(parent: DependenciesTreeNode, dependency: YarnDependency): void {
        const scope: string = NpmUtils.getDependencyScope(dependency.name);
        const generalInfo: GeneralInfo = new GeneralInfo(dependency.name, dependency.version, scope !== '' ? [scope] : [], '', PackageType.Yarn);
        new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.None, parent).xrayDependencyId =
            YarnTreeNode.COMPONENT_PREFIX + dependency.name + ':' + dependency.version;
    }
}
