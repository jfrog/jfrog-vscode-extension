import { PackageType } from '../../../types/projectType';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { ProjectDependencyTreeNode } from './projectDependencyTreeNode';

/**
 * Describes an environment of a project with Xray issues.
 * Holds a list of dependencies that has issues for the current environment.
 */
export class EnvironmentTreeNode extends ProjectDependencyTreeNode {
    constructor(filePath: string, packageType?: PackageType, parent?: IssuesRootTreeNode) {
        super(filePath, packageType, parent);
        this.description = filePath;
        switch (packageType) {
            case PackageType.Python:
                this.name = 'Virtual Environment';
                break;
            default:
                this.name = 'Project Environment';
        }
    }
}
