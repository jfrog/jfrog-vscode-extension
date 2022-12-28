import { FileTreeNode } from '../fileTreeNode';
import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { IssueTreeNode } from '../issueTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';

export class CodeFileTreeNode extends FileTreeNode {
    private _codeIssues: CodeIssueTreeNode[] = [];

    constructor(fileFullPath: string, parent?: IssuesRootTreeNode) {
        super(fileFullPath, parent);
    }

    public get issues(): IssueTreeNode[] {
        return this._codeIssues;
    }

    /** @override */
    public apply() {
        // Sort children
        this._codeIssues
            // 1st priority - Sort by top severity
            .sort((lhs, rhs) => rhs.severity - lhs.severity);

        // Base apply
        super.apply();
    }
}
