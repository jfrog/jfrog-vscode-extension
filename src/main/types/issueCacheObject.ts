import { IReference, IResearch } from 'jfrog-client-js';
import { Severity } from './severity';

export interface IIssueCacheObject {
    cves: string[];
    references: IReference[];
    issueId: string;
    edited: string;
    summary: string;
    severity: Severity;
    fixedVersions: string[];
    researchInfo?: IResearch;
}
