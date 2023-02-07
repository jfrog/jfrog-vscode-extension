import * as vscode from 'vscode';
import { BuildGeneralInfo } from '../../types/buildGeneralinfo';
import { DependencyTreeNode } from '../../dependencyTree/dependencyTreeNode';

export class BuildsNode extends DependencyTreeNode {
    constructor(bgi: BuildGeneralInfo, parent?: DependencyTreeNode) {
        super(bgi, vscode.TreeItemCollapsibleState.None, parent, '');
    }

    /** @override */
    public shallowClone(): BuildsNode {
        let clone: BuildsNode = new BuildsNode(<BuildGeneralInfo>this.generalInfo);
        super.fillShallowClone(clone);
        return clone;
    }
}
