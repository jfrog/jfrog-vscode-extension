import { IArtifact } from 'jfrog-client-js';
import { IIssueKey } from '../types/issueKey';
import { INodeInfo } from '../types/nodeInfo';
import { Severity } from '../types/severity';
import { Translators } from '../utils/translators';

/**
 * Single scan cache object stored in RAM. Contains node info and timestamp.
 * Objects older then 1 week are candidates for deletion.
 */
export class ScanCacheObject {
    private static readonly MILLISECONDS_IN_WEEK: number = 604800000;
    private static readonly NOW: number = Date.now();
    private static readonly INVALIDATE_TIME: number = ScanCacheObject.NOW - ScanCacheObject.MILLISECONDS_IN_WEEK;

    private lastUpdated: number;
    public nodeInfo: INodeInfo;

    public constructor(artifact: IArtifact) {
        this.lastUpdated = ScanCacheObject.NOW;
        this.nodeInfo = {
            pkg_type: artifact.general.pkg_type,
            top_severity: Severity.Normal,
            issues: [],
            licenses: []
        } as INodeInfo;
        for (let issue of artifact.issues) {
            this.nodeInfo.issues.push({ issue_id: issue.issue_id } as IIssueKey);
            let severity: Severity = Translators.toSeverity(issue.severity);
            if (severity > this.nodeInfo.top_severity) {
                this.nodeInfo.top_severity = severity;
            }
        }
        for (let license of artifact.licenses) {
            this.nodeInfo.licenses.push(license.name);
        }
    }

    /**
     * @returns true if the scan cache object contains the nodeInfo field and is newer than 1 week
     */
    public static isValid(scanCacheObject: ScanCacheObject): boolean {
        return !!scanCacheObject['nodeInfo'] && ScanCacheObject.INVALIDATE_TIME <= scanCacheObject.lastUpdated;
    }
}
