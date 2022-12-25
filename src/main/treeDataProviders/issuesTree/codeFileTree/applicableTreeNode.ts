import { FileRegion } from '../../../scanLogic/scanRunners/analyzerModels';
import { Severity } from '../../../types/severity';
import { CodeFileTreeNode } from './codeFileTreeNode';
import { CodeIssueTreeNode } from './codeIssueTreeNode';

export class ApplicableTreeNode extends CodeIssueTreeNode {
    constructor(issueId: string, parent: CodeFileTreeNode, regionWithIssue: FileRegion, severity?: Severity) {
        super(issueId, parent, regionWithIssue, severity);
    }
}
