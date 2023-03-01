import * as path from 'path';
import * as vscode from 'vscode';
import { GeneralInfo } from '../../../types/generalInfo';
import { NpmUtils, ScopedNpmProject } from '../../../utils/npmUtils';
import { ScanUtils } from '../../../utils/scanUtils';
import { YarnUtils } from '../../../utils/yarnUtils';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { BuildTreeErrorType, RootNode } from './rootTree';
import { PackageType } from '../../../types/projectType';
import { LogManager } from '../../../log/logManager';

export class YarnTreeNode extends RootNode {
    private static readonly COMPONENT_PREFIX: string = 'npm://';

    constructor(workspaceFolder: string, private _logManager: LogManager, parent?: DependenciesTreeNode) {
        super(workspaceFolder, PackageType.Yarn, parent);
    }

    public refreshDependencies() {
        let listResults: any;
        try {
            listResults = this.runYarnList();
        } catch (error) {
            this._logManager.logError(<any>error, false);
            this._logManager.logMessageAndToastErr(
                `Failed to scan Yarn project. Hint: Please make sure the command "yarn install" runs successfully in ` + this.workspaceFolder + '".',
                'ERR'
            );
            this.buildError = BuildTreeErrorType.NotInstalled;
        }
        if (!this.buildError) {
            this.populateDependencyTree(this, listResults?.data?.trees);
        }

        const yarnProject: ScopedNpmProject = YarnUtils.getYarnProjectDetails(this.workspaceFolder);
        this.generalInfo = new GeneralInfo(yarnProject.projectName, yarnProject.projectVersion, [], this.workspaceFolder, PackageType.Yarn);
        this.projectDetails.name = yarnProject.projectName || path.join(this.workspaceFolder, 'yarn.lock');
        this.label = this.projectDetails.name;
    }

    private populateDependencyTree(dependencyTreeNode: DependenciesTreeNode, nodes: any[]) {
        if (!nodes) {
            return;
        }
        for (let node of nodes) {
            // Shadow dependencies does not always contain exact version, and therefore we should skip them.
            if (node.shadow) {
                continue;
            }
            const scope: string = NpmUtils.getDependencyScope(node.name);
            let lastIndexOfAt: number = node.name.lastIndexOf('@');
            let dependencyName: string = node.name.substring(0, lastIndexOfAt);
            let dependencyVersion: string = node.name.substring(lastIndexOfAt + 1);

            let generalInfo: GeneralInfo = new GeneralInfo(dependencyName, dependencyVersion, scope !== '' ? [scope] : [], '', PackageType.Yarn);
            let hasRealChildren: boolean = this.hasRealChildren(node.children);
            let treeCollapsibleState: vscode.TreeItemCollapsibleState = hasRealChildren
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;
            let componentId: string = dependencyName + ':' + dependencyVersion;
            this.projectDetails.addDependency(YarnTreeNode.COMPONENT_PREFIX + componentId);

            let child: DependenciesTreeNode = new DependenciesTreeNode(generalInfo, treeCollapsibleState, dependencyTreeNode);
            child.dependencyId = YarnTreeNode.COMPONENT_PREFIX + componentId;
            if (hasRealChildren) {
                this.populateDependencyTree(child, node.children);
            }
        }
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
