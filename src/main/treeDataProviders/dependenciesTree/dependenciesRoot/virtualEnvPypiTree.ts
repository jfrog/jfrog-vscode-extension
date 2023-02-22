import { DependencyScanResults } from '../../../types/workspaceIssuesDetails';
import { EnvironmentTreeNode } from '../../issuesTree/descriptorTree/environmentTreeNode';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { PypiTreeNode } from './pypiTree';

/**
 * Represent all the dependencies / tools that are installed in the virtual environment such as pip and python binaries.
 * Additionally, dependencies not contained in requirements.txt or setup.py will be included as well.
 */
export class VirtualEnvPypiTree extends PypiTreeNode {
    // Virtual env may be located outside the project dir.
    constructor(private _virtualEnvironmentPath: string, workspaceFolder: string, parent?: DependenciesTreeNode) {
        super(workspaceFolder, parent);
        this.generalInfo.artifactId = 'Virtual Environment';
        this.projectDetails.name = this.generalInfo.artifactId;
    }

    public get virtualEnvironmentPath(): string {
        return this._virtualEnvironmentPath;
    }

    public set virtualEnvironmentPath(value: string) {
        this._virtualEnvironmentPath = value;
    }

    public toEnvironmentTreeNode() {
        return new EnvironmentTreeNode(this.virtualEnvironmentPath, this.generalInfo.pkgType);
    }

    public toDependencyScanResults() {
        return {
            type: this.generalInfo.pkgType,
            name: this.generalInfo.artifactId,
            fullPath: this.virtualEnvironmentPath
        } as DependencyScanResults;
    }
}
