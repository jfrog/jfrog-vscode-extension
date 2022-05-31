import { Severity } from '../types/severity';

export interface IScannedCveObject {
    projectPath: string;
    cves: Map<string, Severity>;
}
