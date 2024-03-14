import * as vscode from 'vscode';
import * as path from 'path';
import { LogManager } from '../../../log/logManager';
import { GeneralInfo } from '../../../types/generalInfo';
import { PackageType } from '../../../types/projectType';
import { NpmUtils, ProjectDetails } from '../../../utils/npmUtils';
import { PnpmUtils } from '../../../utils/pnpmUtils';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { BuildTreeErrorType, RootNode } from './rootTree';

export class PnpmTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(fullPath: string, private _logManager: LogManager, parent?: DependenciesTreeNode) {
        super(fullPath, PackageType.Pnpm, parent);
    }

    public async refreshDependencies() {
        let results: any;
        try {
            results = PnpmUtils.runPnpmLs(this.workspaceFolder);
            this.processProjectsInformation(results);
        } catch (error) {
            this._logManager.logError(<any>error, false);
            this._logManager.logMessageAndToastErr(
                `Failed to scan pnpm project. Hint: Please make sure the commands 'pnpm install' run successfully in '${this.workspaceFolder}'`,
                'ERR'
            );
            this.buildError = BuildTreeErrorType.NotInstalled;
        }

        const details: ProjectDetails = NpmUtils.getProjectDetailsFromPackageJson(this.workspaceFolder);
        this.generalInfo = new GeneralInfo(
            details.projectName,
            details.projectVersion,
            [],
            path.join(this.workspaceFolder, 'pnpm-lock.yaml'),
            PackageType.Npm
        );
        this.projectDetails.name = details.projectName ?? this.fullPath;
        this.label = this.projectDetails.name;
    }

    private processProjectsInformation(projects: any[]) {
        if (!projects) {
            return;
        }
        for (let project of projects) {
            if (project.dependencies) {
                this.populateDependenciesTree(this, project.dependencies, 'prod');
            }
            if (project.devDependencies) {
                this.populateDependenciesTree(this, project.devDependencies, 'dev');
            }
        }
        return projects;
    }

    private populateDependenciesTree(parent: DependenciesTreeNode, dependencies: any, scope: string) {
        if (!dependencies) {
            return;
        }
        for (let key in dependencies) {
            let dependency: any = dependencies[key];
            let version: string = dependency.version;
            this.populateDependenciesTree(this.addDependency(parent, key, version, scope), dependency.dependencies, scope);
        }
    }

    private addDependency(parent: DependenciesTreeNode, dependencyName: string, dependencyVersion: string, scope: string): DependenciesTreeNode {
        const generalInfo: GeneralInfo = new GeneralInfo(dependencyName, dependencyVersion, scope !== '' ? [scope] : [], '', PackageType.Pnpm);
        let node: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.None, parent);
        node.xrayDependencyId = PnpmTreeNode.COMPONENT_PREFIX + dependencyName + ':' + dependencyVersion;
        return node;
    }
}
