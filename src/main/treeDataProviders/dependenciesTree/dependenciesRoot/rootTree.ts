import * as vscode from 'vscode';
import * as path from 'path';
import { GeneralInfo } from '../../../types/generalInfo';
import { ProjectDetails } from '../../../types/projectDetails';
import { PackageType } from '../../../types/projectType';
import { DependenciesTreeNode } from '../dependenciesTreeNode';
import { DependencyScanResults } from '../../../types/workspaceIssuesDetails';
import { Utils } from '../../../utils/utils';

export enum BuildTreeErrorType {
    NotInstalled = '[Not Installed]',
    NotSupported = '[Not Supported]'
}

export class RootNode extends DependenciesTreeNode {
    private _projectDetails: ProjectDetails;
    private _workspaceFolder: string;

    private _buildError?: BuildTreeErrorType;

    constructor(private _fullPath: string, packageType: PackageType, parent?: DependenciesTreeNode, contextValue?: string) {
        super(new GeneralInfo('', '', [], _fullPath, packageType), vscode.TreeItemCollapsibleState.Expanded, parent, contextValue);
        this._projectDetails = new ProjectDetails(_fullPath, packageType);
        this._workspaceFolder = path.dirname(_fullPath);
    }

    public get projectDetails(): ProjectDetails {
        return this._projectDetails;
    }

    public set projectDetails(value: ProjectDetails) {
        this._projectDetails = value;
    }

    public get buildError() {
        return this._buildError;
    }

    public set buildError(value: BuildTreeErrorType | undefined) {
        this._buildError = value;
    }

    public get fullPath() {
        return this._fullPath;
    }

    public set fullPath(value: string) {
        this._fullPath = value;
    }

    public get workspaceFolder() {
        return this._workspaceFolder;
    }

    public set workspaceFolder(wsFolder: string) {
        this._workspaceFolder = wsFolder;
    }

    public createEmptyScanResultsObject(): DependencyScanResults {
        return {
            type: this._projectDetails.type,
            name: Utils.getLastSegment(this.fullPath),
            fullPath: this.fullPath
        } as DependencyScanResults;
    }

    public flattenRootChildren(): RootNode[] {
        let result: RootNode[] = [];
        for (let child of this.children) {
            if (child instanceof RootNode) {
                result.push(child, ...child.flattenRootChildren());
            }
        }
        return result;
    }
}
