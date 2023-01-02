import { FileTreeNode } from '../fileTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { PackageType } from '../../../types/projectType';
import { IssueTreeNode } from '../issueTreeNode';
import { CveApplicableDetails } from '../../../scanLogic/scanRunners/applicabilityScan';
import { CveTreeNode } from './cveTreeNode';
import { IComponent } from 'jfrog-client-js';
import { Severity } from '../../../types/severity';

/**
 * Describes a descriptor file type with Xray issues for the 'Issues' view.
 * Holds a list of dependencies that has issues
 */
export class DescriptorTreeNode extends FileTreeNode {
    private _dependenciesWithIssue: DependencyIssuesTreeNode[] = [];
    private _dependencyScanTimeStamp?: number;
    private _applicableScanTimeStamp?: number | undefined;

    private _packageType: PackageType;

    // Not applicaible if key in here and not in the map below
    private _scannedCve?: Set<string> | undefined;
    // Is applicable if key in here
    private _applicableCve?: Map<string, CveApplicableDetails> | undefined;

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
        return this._dependenciesWithIssue.find(dependncy => dependncy.artifactId === artifactId);
    }

    /** @override */
    public getIssueById(id: string): IssueTreeNode | undefined {
        for (const dependecy of this._dependenciesWithIssue) {
            for (const issue of dependecy.issues) {
                if (id === issue.issueId || (issue instanceof CveTreeNode && issue.cve && id === issue.cve.cve)) {
                    return issue;
                }
            }
        }
        return undefined;
    }

    /**
     * Search for the dependency in the descriptor base on componentId.
     * If found will update the top severity of the node if the given sevirity is higher.
     * If not found it will create a new one and add it to the descriptor node
     * @param componentId - the id (type,name,version) of the dependency
     * @param component - the dependecy data to create
     * @param severity - the severity to create/update
     * @returns the dependency object if exists, else a newly created one base on the input
     */
    public addNode(componentId: string, component: IComponent, severity: Severity): DependencyIssuesTreeNode {
        let dependencyWithIssue: DependencyIssuesTreeNode | undefined = this.getDependencyByID(componentId);
        if (!dependencyWithIssue) {
            dependencyWithIssue = new DependencyIssuesTreeNode(componentId, component, severity, this);
            this.dependenciesWithIssue.push(dependencyWithIssue);
        }
        return dependencyWithIssue;
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

    public get applicableScanTimeStamp(): number | undefined {
        return this._applicableScanTimeStamp;
    }

    public set applicableScanTimeStamp(value: number | undefined) {
        this._applicableScanTimeStamp = value;
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

    public get scannedCve(): Set<string> | undefined {
        return this._scannedCve;
    }

    public set scannedCve(value: Set<string> | undefined) {
        this._scannedCve = value;
    }

    public get applicableCve(): Map<string, CveApplicableDetails> | undefined {
        return this._applicableCve;
    }

    public set applicableCve(value: Map<string, CveApplicableDetails> | undefined) {
        this._applicableCve = value;
    }

    public get dependenciesWithIssue(): DependencyIssuesTreeNode[] {
        return this._dependenciesWithIssue;
    }

    public get type(): PackageType {
        return this._packageType;
    }
}
