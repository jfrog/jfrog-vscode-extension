import { GeneralInfo } from '../../../types/generalInfo';
import { PackageType } from '../../../types/projectType';
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
        this.generalInfo = new GeneralInfo('Virtual Environment', '', ['None'], this.workspaceFolder, PackageType.Python);
        this.projectDetails.name = this.generalInfo.artifactId;
        this.label = this.projectDetails.name;
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
            name: 'Virtual Environment',
            fullPath: this.virtualEnvironmentPath
        } as DependencyScanResults;
    }
}
