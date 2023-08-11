export interface AnalyzerRequest {
    scans: AnalyzeScanRequest[];
}

export enum ScanType {
    ContextualAnalysis = 'analyze-applicability',
    Iac = 'iac-scan-modules',
    Eos = 'analyze-codebase',
    Secrets = 'secrets-scan'
}

export type AnalyzerManagerSeverityLevel = 'none' | 'note' | 'warning' | 'error';

export type ResultKind = 'pass' | 'fail';

export interface AnalyzeScanRequest {
    // What type of scan
    type: ScanType;
    // The path that the response will be written to
    output: string;
    // List of path to folders that scan will run inside
    roots: string[];
    // Glob Pattern represent the files (not folders) that should be skipped
    skipped_folders: string[];
}

export interface AnalyzerScanResponse {
    runs: AnalyzerScanRun[];
}

export interface AnalyzerScanRun {
    tool: {
        driver: AnalyzerDriver;
    };
    results: AnalyzeIssue[];
}

export interface AnalyzerDriver {
    name: string;
    rules: AnalyzerRule[];
}

export interface AnalyzerRule {
    id: string;
    fullDescription?: ResultContent;
}

export interface AnalyzeIssue {
    ruleId: string;
    message: ResultContent;
    locations: AnalyzeLocation[];
    kind?: ResultKind;
    level?: AnalyzerManagerSeverityLevel;
    suppressions?: AnalyzeSuppression[];
    codeFlows?: CodeFlow[];
}

export interface AnalyzeSuppression {
    kind: string;
}

export interface CodeFlow {
    threadFlows: threadFlow[];
}

export interface threadFlow {
    locations: threadFlowLocation[];
}

export interface threadFlowLocation {
    location: AnalyzeLocation;
}

export interface AnalyzeLocation {
    physicalLocation: FileLocation;
}

export interface FileLocation {
    artifactLocation: FileUri;
    region: FileRegion;
}

export interface FileIssues {
    full_path: string;
    locations: FileRegion[];
}

export interface FileUri {
    uri: string;
}

export interface FileRegion {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
    snippet?: ResultContent;
}

export interface ResultContent {
    text: string;
}
