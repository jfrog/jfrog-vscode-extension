import * as path from 'path';
import * as vscode from 'vscode';
import { GeneralInfo } from '../../../types/generalInfo';
import { NpmUtils, ProjectDetails } from '../../../utils/npmUtils';
import { ScanUtils } from '../../../utils/scanUtils';
import { YarnUtils } from '../../../utils/yarnUtils';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { BuildTreeErrorType, RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';
import { LogManager } from '../../../log/logManager';
import { IImpactGraph } from 'jfrog-ide-webview';
import { YarnImpactGraphUtil } from '../../utils/yarnImpactGraph';

export class YarnTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(workspaceFolder: string, private _logManager: LogManager, parent?: DependenciesTreeNode) {
        super(workspaceFolder, PackageType.Yarn, parent);
    }

    public loadYarnDependencies() {
        let results: any;
        try {
            results = this.runYarnList();
            this.loadYarnList(this, results?.data?.trees);
        } catch (error) {
            this._logManager.logError(<any>error, false);
            this._logManager.logMessageAndToastErr(
                `Failed to scan Yarn project. Hint: Please make sure the command "yarn install" runs successfully in ` + this.workspaceFolder + '".',
                'ERR'
            );
            this.buildError = BuildTreeErrorType.NotInstalled;
        }

        const yarnProject: ProjectDetails = YarnUtils.getYarnProjectDetails(this.workspaceFolder);
        this.generalInfo = new GeneralInfo(yarnProject.projectName, yarnProject.projectVersion, [], this.workspaceFolder, PackageType.Yarn);
        this.projectDetails.name = yarnProject.projectName || path.join(this.workspaceFolder, 'yarn.lock');
        this.label = this.projectDetails.name;
    }

    /** @override */
    public createImpactedGraph(name: string, version: string): IImpactGraph {
        return new YarnImpactGraphUtil(name, version, this.generalInfo.getComponentId(), this.workspaceFolder).create();
    }

    /**
     * Parse and load all yarn list's dependencies into concert object.
     * @param parent - Parent Yarn dependency that is loaded into object from 'yarn list'.
     * @param children - Child dependency of parent in Yarn list form
     * @returns
     */
    private loadYarnList(parent: DependenciesTreeNode, children: any[]) {
        if (!children) {
            return;
        }
        for (let node of children) {
            // Shadow dependencies does not always contain exact version, and therefore we should skip them.
            if (node.shadow) {
                continue;
            }
            this.addDependency(parent, node);
            if (this.hasRealChildren(node.children)) {
                this.loadYarnList(parent, node.children);
            }
        }
    }

    private extractDependencyInfo(node: any): string[] {
        const scope: string = NpmUtils.getDependencyScope(node.name);
        let lastIndexOfAt: number = node.name.lastIndexOf('@');
        let name: string = node.name.substring(0, lastIndexOfAt);
        let version: string = node.name.substring(lastIndexOfAt + 1);
        return [name, version, scope];
    }

    private addDependency(parent: DependenciesTreeNode, node: any): void {
        const [dependencyName, dependencyVersion, scope] = this.extractDependencyInfo(node);
        const generalInfo: GeneralInfo = new GeneralInfo(dependencyName, dependencyVersion, scope !== '' ? [scope] : [], '', PackageType.Yarn);
        new DependenciesTreeNode(generalInfo, vscode.TreeItemCollapsibleState.None, parent).xrayId =
            YarnTreeNode.COMPONENT_PREFIX + dependencyName + ':' + dependencyVersion;
    }

    /**
     * Return true if the child dependencies contain any non shadowed dependency.
     * @param childDependencies - Child dependencies at 'yarn list' results
     * @returns true if the child dependencies contain any non shadowed dependency.
     */
    private hasRealChildren(childDependencies: any[]): boolean {
        if (!childDependencies) {
            return false;
        }
        for (let child of childDependencies) {
            if (!child.shadow) {
                return true;
            }
        }
        return false;
    }

    private runYarnList(): any {
        return JSON.parse(ScanUtils.executeCmd('yarn list --json --no-progress', this.workspaceFolder).toString());
    }
}
