import * as vscode from 'vscode';
import {DependenciesTreeNode} from '../dependenciesTreeNode';
import {BuildGeneralInfo} from "../../../types/buildGeneralinfo";
import {IDetailsResponse} from "jfrog-client-js";
import {Issue} from "../../../types/issue";
import {Severity} from "../../../types/severity";
import {BuildsUtils} from "../../../utils/builds/buildsUtils";

export class BuildsNode extends DependenciesTreeNode {
    constructor(bgi: BuildGeneralInfo, parent?: DependenciesTreeNode) {
        super(bgi, vscode.TreeItemCollapsibleState.None, parent, '');
    }

    public populateBuildDependencyTree(response: IDetailsResponse): void {
        if (!response) {
            // If no response from Xray, the dependency tree components status is unknown.
            // Populate all nodes with dummy unknown level issues to show the unknown icon in tree nodes.
            this.populateTreeWithUnknownIssues();
            return;
        }

        for (const module of this.children) {
            for (const artifactsOrDep of module.children) {
                const isArtifactNode: boolean = artifactsOrDep.generalInfo.artifactId === BuildsUtils.ARTIFACTS_NODE;
                for (const child of artifactsOrDep.children) {
                    // Populate dependencies and artifacts
                    // todo fix with sha1 @yahav
                }
            }
        }
    }

    public populateTreeWithUnknownIssues() {
        for (const node of this.children) {
            node.issues.add(new Issue('', Severity.Unknown, '', ''));
        }
    }
}
