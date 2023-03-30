import * as path from 'path';
import * as vscode from 'vscode';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { GeneralInfo } from '../../../types/generalInfo';
import { ProjectDetails, NpmUtils } from '../../../utils/npmUtils';
import { BuildTreeErrorType, RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';
import { Severity } from '../../../types/severity';
import { LogManager } from '../../../log/logManager';
import { NpmCmd } from '../../../utils/cmds/npm';

export class NpmTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(fullPath: string, private _logManager: LogManager, parent?: DependenciesTreeNode) {
        super(fullPath, PackageType.Npm, parent);
    }

    public async refreshDependencies() {
        const projectDetails: ProjectDetails = new ProjectDetails();
        let npmLsFailed: boolean = false;
        try {
            projectDetails.loadProjectDetails(NpmCmd.runNpmLs(this.workspaceFolder));
        } catch (error) {
            this._logManager.logError(<any>error, false);
            projectDetails.loadProjectDetailsFromFile(path.join(this.fullPath));
            npmLsFailed = true;
        }
        this.populateDependenciesTree(this, projectDetails.dependencies);
        if (npmLsFailed) {
            this.topSeverity = Severity.Unknown;
            this.buildError = BuildTreeErrorType.NotInstalled;
            this._logManager.logMessageAndToastErr(
                `Failed to scan npm project. Hint: Please make sure the commands 'npm install' or 'npm ci' run successfully in '${this.workspaceFolder}'`,
                'ERR'
            );
        }
        this.generalInfo = new GeneralInfo(projectDetails.projectName, projectDetails.projectVersion, [], this.fullPath, PackageType.Npm);

        this.projectDetails.name = projectDetails.projectName ? projectDetails.projectName : this.fullPath;
        this.label = this.projectDetails.name;
    }

    private populateDependenciesTree(dependenciesTreeNode: DependenciesTreeNode, dependencies: any) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let version: string = dependency.version;
            if (version) {
                let childDependencies: any = dependency.dependencies;
                const scope: string = NpmUtils.getDependencyScope(key);
                let generalInfo: GeneralInfo = new GeneralInfo(key, version, [scope], '', PackageType.Npm);
                let treeCollapsibleState: vscode.TreeItemCollapsibleState = childDependencies
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;
                let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependenciesTreeNode);
                let componentId: string = key + ':' + version;
                this.projectDetails.addDependency(NpmTreeNode.COMPONENT_PREFIX + componentId);
                child.dependencyId = NpmTreeNode.COMPONENT_PREFIX + componentId;
                this.populateDependenciesTree(child, childDependencies);
            }
        }
    }
}
