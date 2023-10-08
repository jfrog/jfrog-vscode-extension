export interface JFrogAppsConfig {
    version: string;
    modules: Module[];
}

export enum ScanType {
    ContextualAnalysis = 'applicability',
    Iac = 'iac',
    Sast = 'sast',
    Secrets = 'secrets'
}

export interface Module {
    name: string;
    source_root: string;
    exclude_patterns: string[];
    exclude_scanners: ScanType[];
    scanners: Scanners;
}

export interface Scanners {
    secrets: Scanner;
    iac: Scanner;
    sast: SastScanner;
}

export interface Scanner {
    working_dirs: string[];
    exclude_patterns: string[];
}

export interface SastScanner extends Scanner {
    language: string;
    excluded_rules: string[];
}
