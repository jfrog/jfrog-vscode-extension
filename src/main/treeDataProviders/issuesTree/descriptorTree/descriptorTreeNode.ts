import * as vscode from 'vscode';
import { SeverityUtils } from '../../../types/severity';

import { BaseFileTreeNode } from '../baseFileTreeNode';
import { DependencyIssueTreeNode } from './dependencyIssueTreeNode';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { Utils } from '../../utils/utils';
import { toPackgeType } from '../../../types/projectType';
// import { ProjectRootTreeNode } from "./projectRootTreeNode";
// import { ProjectDetails } from '../../types/projectDetails';
// import { DependenciesTreeNode } from '../dependenciesTree/dependenciesTreeNode';

export class DescriptorTreeNode extends BaseFileTreeNode {
    //_details: ProjectDetails;
    //_tree?: DependenciesTreeNode;
    public tempcount: number = 0;
    private _dependenciesWithIssue: DependencyIssueTreeNode[] = [];

    private _dependencyScanTimeStamp?: number;
    private _applicableScanTimeStamp?: number;

    constructor(
        fileFullPath: string,
        //descriptorDetails: ProjectDetails,
        parent?: IssuesRootTreeNode,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(fileFullPath, parent, collapsibleState);
        //this._details = descriptorDetails;
    }

    public get applicableScanTimeStamp(): number | undefined {
        return this._applicableScanTimeStamp;
    }

    public set applicableScanTimeStamp(value: number | undefined) {
        this._applicableScanTimeStamp = value;
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

        if (this._applicableScanTimeStamp != undefined) {
            if (oldest == undefined || this._applicableScanTimeStamp < oldest) {
                oldest = this._applicableScanTimeStamp;
            }
        }
        return oldest;
    }

    public getDependencyByID(artifactId: string): DependencyIssueTreeNode | undefined {
        return this._dependenciesWithIssue.find(dependncy => dependncy.artifactId == artifactId);
    }

    public searchDependency(type: string, name: string, version: string): DependencyIssueTreeNode | undefined {
        return this._dependenciesWithIssue.find(
            dependncy => dependncy.name == name && dependncy.version == version && dependncy.type == toPackgeType(type)
        );
    }

    //public get details(): ProjectDetails {
    //    return this._details;
    //}

    //public get dependencyTree(): DependenciesTreeNode | undefined {
    //    return this._tree;
    //}

    //public set dependencyTree(value: DependenciesTreeNode | undefined) {
    //    this._tree = value;
    //}

    public get dependenciesWithIssue(): DependencyIssueTreeNode[] {
        return this._dependenciesWithIssue;
    }

    public apply() {
        super.apply();

        let issueCount: number = 0;
        if (this.dependenciesWithIssue.length == 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        } else {
            if (this.dependenciesWithIssue.length == 1 && this.parent?.children.length == 1) {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
            } else {
                this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            }
        }

        this._dependenciesWithIssue.forEach(dependency => {
            dependency.apply();
            issueCount += dependency.issues.length;
        });

        this.tooltip = 'Top severity: ' + SeverityUtils.getString(this.severity) + '\nIssues count: ' + issueCount + '\n';
        if (this._dependencyScanTimeStamp == this._applicableScanTimeStamp) {
            this.tooltip += "Last scan completed at '" + Utils.toDate(this._dependencyScanTimeStamp) + "'\n";
        } else {
            this.tooltip += "Dependency scan completed at '" + Utils.toDate(this._dependencyScanTimeStamp) + "'\n";
            this.tooltip += "Applicability scan completed at '" + Utils.toDate(this._applicableScanTimeStamp) + "'\n";
        }
        this.tooltip += 'Full path: ' + this.fullPath;

        this._dependenciesWithIssue
            // 3rd priority - Sort by number of issues
            // .sort((lhs, rhs) => lhs.issues.size() - rhs.issues.size())

            // 2nd priority - Sort by number of children
            .sort((lhs, rhs) => rhs.issues.length - lhs.issues.length)

            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.topSeverity - lhs.topSeverity);
    }
}