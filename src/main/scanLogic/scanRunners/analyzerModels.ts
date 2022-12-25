export interface AnalyzerRequest {
    scans: AnalyzeScanRequest[];
}

type AnalyzerType = 'analyze-applicability' | 'analyze-codebase';

export interface AnalyzeScanRequest {
    type: AnalyzerType; // what type of scan
    output: string; // the path that the response will be written to
    roots: string[]; // list of path to root folder that scan all inside -> ["./"]
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
    rules?: {
        id: string;
    }[];
}

export interface AnalyzeIssue {
    ruleId: string;
    message: ResultContent;
    locations: FileLocation[];
}

export interface FileLocation {
    physicalLocation: {
        artifactLocation: FileUri;
        region: FileRegion;
    };
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
    startColumn: number; // characters columns
    endColumn: number;
    snippet?: ResultContent;
}

export interface ResultContent {
    text: string;
}
