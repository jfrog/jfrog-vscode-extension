import { Severity } from './severity';

export interface ProjectComponents {
    componentIdToCve: Map<string, CveDetails>;
}
export interface CveDetails {
    cveToSeverity: Map<string, Severity>;
}
