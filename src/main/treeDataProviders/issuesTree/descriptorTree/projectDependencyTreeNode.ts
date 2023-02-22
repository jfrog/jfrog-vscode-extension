import { FileTreeNode } from '../fileTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { PackageType } from '../../../types/projectType';
import { IssueTreeNode } from '../issueTreeNode';
import { CveTreeNode } from './cveTreeNode';
import { IComponent } from 'jfrog-client-js';
import * as path from 'path';

/**
 * Describes a base class for descriptor/environment dependencies.
 * Holds a list of dependencies that has issues
 */
export class ProjectDependencyTreeNode extends FileTreeNode {
    protected _dependenciesWithIssue: DependencyIssuesTreeNode[] = [];
    protected _dependencyScanTimeStamp?: number;
    protected _applicableScanTimeStamp?: number;
    protected _packageType: PackageType;
    private projectPath: string;

    constructor(filePath: string, packageType?: PackageType, parent?: IssuesRootTreeNode) {
        super(filePath, parent);
        this._packageType = packageType ?? PackageType.Unknown;
        this.projectPath = path.dirname(filePath);
    }

    /** @override */
    public apply() {
        // Apply the child issue nodes
        this._dependenciesWithIssue.forEach(dependency => {
            dependency.apply();
        });
        // Sort children
        this._dependenciesWithIssue
            // 3rd priority - Sort by number of children
            .sort((lhs, rhs) => rhs.issues.length - lhs.issues.length)
            // 2nd priority - Sort by direct dependencies
            .sort((lhs, rhs) => (rhs.indirect ? 0 : 1) - (lhs.indirect ? 0 : 1))
            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);

        // Base apply
        super.apply();
    }

    /**
     * Search for dependency with issue in this project, base on a given artifactId.
     * @param artifactId - the artifactId (type,name,version) or the componentId (name,version) of the dependency to search
     * @returns - DependencyIssuesTreeNode with the artifactId if exists or undefined otherwise
     */
    public getDependencyByID(artifactId: string): DependencyIssuesTreeNode | undefined {
        return this._dependenciesWithIssue.find(dependency => dependency.artifactId === artifactId || dependency.componentId === artifactId);
    }

    /** @override */
    public getIssueById(id: string): IssueTreeNode[] {
        let results: IssueTreeNode[] = [];
        for (const dependency of this._dependenciesWithIssue) {
            for (const issue of dependency.issues) {
                if (id === issue.issueId || (issue instanceof CveTreeNode && issue.cve && id === issue.cve.cve)) {
                    results.push(issue);
                }
            }
        }
        return results;
    }

    /**
     * Search for the dependency in the project, base on componentId.
     * If found will update the top severity of the node if the given severity is higher.
     * If not found it will create a new one and add it to the project node
     * @param artifactId - the id (type,name,version) of the dependency
     * @param component - the dependency data to create
     * @param indirect - default to false, true if the dependency is indirect
     * @returns the dependency object if exists, else a newly created one base on the input
     */
    public addNode(artifactId: string, component: IComponent, indirect: boolean = false): DependencyIssuesTreeNode {
        let dependencyWithIssue: DependencyIssuesTreeNode | undefined = this.getDependencyByID(artifactId);
        if (!dependencyWithIssue) {
            dependencyWithIssue = new DependencyIssuesTreeNode(artifactId, component, indirect, this);
            this.dependenciesWithIssue.push(dependencyWithIssue);
        }
        return dependencyWithIssue;
    }

    /** @override */
    public get issues(): IssueTreeNode[] {
        let issues: IssueTreeNode[] = [];
        this._dependenciesWithIssue.forEach(dependency => {
            issues.push(...dependency.issues);
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
        if (this._dependencyScanTimeStamp !== undefined) {
            if (oldest === undefined || this._dependencyScanTimeStamp < oldest) {
                oldest = this._dependencyScanTimeStamp;
            }
        }
        if (this._applicableScanTimeStamp !== undefined) {
            if (oldest === undefined || this._applicableScanTimeStamp < oldest) {
                oldest = this._applicableScanTimeStamp;
            }
        }
        return oldest;
    }

    public get dependenciesWithIssue(): DependencyIssuesTreeNode[] {
        return this._dependenciesWithIssue;
    }

    public set dependenciesWithIssue(dependencyIssuesTreeNode: DependencyIssuesTreeNode[]) {
        this._dependenciesWithIssue = dependencyIssuesTreeNode;
    }

    public get type(): PackageType {
        return this._packageType;
    }

    public getProjectPath() {
        return this.projectPath;
    }

    public getProjectFilePath() {
        return this.projectFilePath;
    }
}
