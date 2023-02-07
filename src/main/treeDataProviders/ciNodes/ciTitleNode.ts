import * as vscode from 'vscode';
import { DependencyTreeNode } from '../../dependencyTree/dependencyTreeNode';
import { GeneralInfo } from '../../types/generalInfo';

/**
 * This node is used in CI mode, to gather modules/artifacts/dependencies under.
 * It's uniqueness is in the Component Details fields it shows (ignores irrelevant ones).
 */
export class CiTitleNode extends DependencyTreeNode {
    public static readonly MODULES_NODE: string = 'modules';
    public static readonly ARTIFACTS_NODE: string = 'artifacts';
    public static readonly DEPENDENCIES_NODE: string = 'dependencies';

    constructor(generalInfo: GeneralInfo, collapsibleState?: vscode.TreeItemCollapsibleState, parent?: DependencyTreeNode) {
        super(generalInfo, collapsibleState, parent, '');
    }
}
