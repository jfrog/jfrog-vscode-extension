import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { PackageType } from '../../../types/projectType';
import { ProjectDependencyTreeNode } from './projectDependencyTreeNode';
/**
 * Describes a descriptor of a project with Xray issues.
 * Holds a list of dependencies that has issues for the current environment.
 */
export class DescriptorTreeNode extends ProjectDependencyTreeNode {
    constructor(filePath: string, packageType?: PackageType, parent?: IssuesRootTreeNode) {
        super(filePath, packageType, parent);
    }
}
