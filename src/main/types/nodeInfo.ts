import { Severity } from '../types/severity';
import { IIssueKey } from './issueKey';
import { ILicenseKey } from './licenseKey';

export interface INodeInfo {
    top_severity: Severity;
    licenses: ILicenseKey[];
    issues: IIssueKey[];
}
