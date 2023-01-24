import { FileTreeNode } from '../fileTreeNode';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';

export class CodeFileTreeNode extends FileTreeNode {
    private _codeIssues: CodeIssueTreeNode[] = [];

    constructor(fileFullPath: string, parent?: IssuesRootTreeNode) {
        super(fileFullPath, parent);
    }

    public get issues(): CodeIssueTreeNode[] {
        return this._codeIssues;
    }

    /** @override */
    public apply() {
        this._codeIssues
            // Sort by top severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);

        // Base apply
        super.apply();
    }
}
