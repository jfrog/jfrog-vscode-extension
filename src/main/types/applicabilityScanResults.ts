export interface ApplicabilityScanResults {
    results: Map<string, ApplicabilityScanResult[]>;
    scanners_ran: string[];
}

export interface ApplicabilityScanResult {
    file_name: string;
    // Issue reference. e.g. snippets":["AES.new()"]
    snippet: string;
    // Issue details
    text: string;
    start_line: number;
    end_line: number;
    start_column: number;
    end_column: number;
}
