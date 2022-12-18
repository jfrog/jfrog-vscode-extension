import * as vscode from 'vscode';

import { FileTreeNode } from '../fileTreeNode';
import { DependencyIssuesTreeNode } from './dependencyIssuesTreeNode';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { PackageType } from '../../../types/projectType';
import { IssueTreeNode } from '../issueTreeNode';

/**
 * Describes a descriptor file type with Xray issues for the 'Issues' view.
 * Holds a list of dependencies that has issues
 */
export class DescriptorTreeNode extends FileTreeNode {

    private _dependenciesWithIssue: DependencyIssuesTreeNode[] = [];
    private _dependencyScanTimeStamp?: number;
    private _packageType: PackageType = PackageType.Unknown;

    constructor(
        fileFullPath: string,
        parent?: IssuesRootTreeNode
    ) {
        super(fileFullPath, parent);
    }

    /** @override */
    public apply() {
        // Apply the child issue nodes
        this._dependenciesWithIssue.forEach(dependency => {
            this._packageType = dependency.type;
            dependency.apply();
        });
        // Set collapsible state base on children count
        if (this.dependenciesWithIssue.length == 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        } else {
            if (this.dependenciesWithIssue.length == 1 && this.parent?.children.length == 1) {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            } else {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }
        }
        // Sort children
        this._dependenciesWithIssue
            // 2nd priority - Sort by number of children
            .sort((lhs, rhs) => rhs.issues.length - lhs.issues.length)
            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.topSeverity - lhs.topSeverity);

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
