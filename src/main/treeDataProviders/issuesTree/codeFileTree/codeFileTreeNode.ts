import { AnalyzerUtils } from '../../utils/analyzerUtils';
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

    public addIssue(node: CodeIssueTreeNode): boolean {
        if (!this.hasSimilarIssue(node)) {
            this._codeIssues.push(node);
            return true;
        }
        return false;
    }

    private hasSimilarIssue(node: CodeIssueTreeNode) {
        return (
            this._codeIssues.find(issue => issue.label === node.label && AnalyzerUtils.isEqualRange(node.regionWithIssue, issue.regionWithIssue)) !=
            undefined
        );
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
