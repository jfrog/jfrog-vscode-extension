import { Severity } from './severity';

export interface IIssueCacheObject {
    cves: string[];
    references: string[];
    issueId: string;
    summary: string;
    severity: Severity;
    fixedVersions: string[];
}
