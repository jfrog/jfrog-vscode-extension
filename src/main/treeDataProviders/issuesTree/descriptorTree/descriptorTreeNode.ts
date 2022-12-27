import { FileTreeNode } from '../fileTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { PackageType } from '../../../types/projectType';
import { IssueTreeNode } from '../issueTreeNode';
import { CveTreeNode } from './cveTreeNode';

/**
 * Describes a descriptor file type with Xray issues for the 'Issues' view.
 * Holds a list of dependencies that has issues
 */
export class DescriptorTreeNode extends FileTreeNode {
    private _dependenciesWithIssue: DependencyIssuesTreeNode[] = [];
    private _dependencyScanTimeStamp?: number;
    private _packageType: PackageType;

    constructor(fileFullPath: string, packageType?: PackageType, parent?: IssuesRootTreeNode) {
        super(fileFullPath, parent);
        this._packageType = packageType ?? PackageType.Unknown;
    }

    /** @override */
    public apply() {
        // Apply the child issue nodes
        this._dependenciesWithIssue.forEach(dependency => {
            dependency.apply();
        });
        // Sort children
        this._dependenciesWithIssue
            // 2nd priority - Sort by number of children
            .sort((lhs, rhs) => rhs.issues.length - lhs.issues.length)
            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);

        // Base apply
        super.apply();
    }

    /**
     * Search for registered dependency with issue in this descriptor base on a given artifactId.
     * @param artifactId - the id of the dependency to search
     * @returns - DependencyIssuesTreeNode with the artifactId if exists or undefined otherwise
     */
    public getDependencyByID(artifactId: string): DependencyIssuesTreeNode | undefined {
        return this._dependenciesWithIssue.find(dependncy => dependncy.artifactId == artifactId);
    }

    /** @override */
    public getIssueById(id: string): IssueTreeNode | undefined {
        for (const dependecy of this._dependenciesWithIssue) {
            for (const issue of dependecy.issues) {
                if (id == issue.issueId || (issue instanceof CveTreeNode && issue.cve && id == issue.cve.cve)) {
                    return issue;
                }
            }
        }
        return undefined;
    }

    /** @override */
    public get issues(): IssueTreeNode[] {
        let issues: IssueTreeNode[] = [];
        this._dependenciesWithIssue.forEach(dependecy => {
            issues.push(...dependecy.issues);
        });
        return issues;
    }

    public get dependencyScanTimeStamp(): number | undefined {
        return this._dependencyScanTimeStamp;
    }
    public set dependencyScanTimeStamp(value: number | undefined) {
        this._dependencyScanTimeStamp = value;
    }

    public get timeStamp(): number | undefined {
        let oldest: number | undefined;
        if (this._dependencyScanTimeStamp != undefined) {
            if (oldest == undefined || this._dependencyScanTimeStamp < oldest) {
                oldest = this._dependencyScanTimeStamp;
            }
        }
        return oldest;
    }

    public get dependenciesWithIssue(): DependencyIssuesTreeNode[] {
        return this._dependenciesWithIssue;
    }

    public get type(): PackageType {
        return this._packageType;
    }
}
