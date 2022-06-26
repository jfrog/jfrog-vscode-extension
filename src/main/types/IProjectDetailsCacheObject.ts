import { Severity } from './severity';

export interface IProjectDetailsCacheObject {
    projectPath: string;
    projectName: string;
    cves: Map<string, Severity>;
}
