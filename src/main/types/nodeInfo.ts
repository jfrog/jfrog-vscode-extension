import { IIssueKey } from './issueKey';
import { Severity } from '../types/severity';

export interface INodeInfo {
    pkg_type: string;
    top_severity: Severity;
    issues: IIssueKey[];
    licenses: string[];
}
