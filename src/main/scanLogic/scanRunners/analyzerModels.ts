export interface AnalyzerRequest {
    scans: AnalyzeScanRequest[];
}

type AnalyzerType = 'analyze-applicability' | 'analyze-codebase' | 'iac-scan-modules';

export interface AnalyzeScanRequest {
    // What type of scan
    type: AnalyzerType;
    // The path that the response will be written to
    output: string;
    // List of path to folders that scan will run inside
    roots: string[];
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
    fullDescription: ResultContent;
}

export interface AnalyzeIssue {
    ruleId: string;
    message: ResultContent;
    locations: AnalyzeLocation[];
    codeFlows?: CodeFlow[];
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
