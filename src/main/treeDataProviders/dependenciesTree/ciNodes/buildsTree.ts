import * as vscode from 'vscode';
import { BuildGeneralInfo } from '../../../types/buildGeneralinfo';
import { DependenciesTreeNode } from '../dependenciesTreeNode';

export class BuildsNode extends DependenciesTreeNode {
    constructor(bgi: BuildGeneralInfo, parent?: DependenciesTreeNode) {
        super(bgi, vscode.TreeItemCollapsibleState.None, parent, '');
    }

    /** @override */
    public shallowClone(): BuildsNode {
        let clone: BuildsNode = new BuildsNode(<BuildGeneralInfo>this.generalInfo);
        super.fillShallowClone(clone);
        return clone;
    }
}
