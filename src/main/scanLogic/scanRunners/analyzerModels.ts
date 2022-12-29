export interface AnalyzerRequest {
    scans: AnalyzeScanRequest[];
}

type AnalyzerType = 'analyze-applicability' | 'analyze-codebase';

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
    startColumn: number;
    endColumn: number;
    snippet?: ResultContent;
}

export interface ResultContent {
    text: string;
}
