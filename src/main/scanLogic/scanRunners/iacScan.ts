import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { Severity } from '../../types/severity';
import { Translators } from '../../utils/translators';
import { AnalyzeIssue, AnalyzeScanRequest, AnalyzerScanResponse, AnalyzerType, FileRegion } from './analyzerModels';
import { BinaryRunner } from './binaryRunner';

/**
 * The response that is generated from the binary after scanning Iac
 */
export interface IacScanResponse {
    filesWithIssues: IacFileIssues[];
}

export interface IacFileIssues {
    full_path: string;
    issues: IacIssue[];
}

export interface IacIssue {
    ruleId: string;
    severity: Severity;
    ruleName: string;
    fullDescription?: string;
    locations: FileRegion[];
}

/**
 * Describes a runner for the 'Infrastructure As Code' (Iac) scan executable file.
 */
export class IacRunner extends BinaryRunner {
    constructor(connectionManager: ConnectionManager, abortCheckInterval: number, logManager: LogManager) {
        super(connectionManager, abortCheckInterval, AnalyzerType.Iac, logManager);
    }

    /** @override */
    public async runBinary(checkCancel: () => void, yamlConfigPath: string, executionLogDirectory: string): Promise<void> {
        await this.executeBinary(checkCancel, ['iac', yamlConfigPath], executionLogDirectory);
    }

    public async scan(directory: string, checkCancel: () => void): Promise<IacScanResponse> {
        let request: AnalyzeScanRequest = {
            type: AnalyzerType.Iac,
            roots: [directory]
        } as AnalyzeScanRequest;
        return await this.run(checkCancel, request).then(runResult => this.generateScanResponse(runResult));
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateScanResponse(response?: AnalyzerScanResponse): IacScanResponse {
        if (!response) {
            return {} as IacScanResponse;
        }
        let iacResponse: IacScanResponse = {
            filesWithIssues: []
        } as IacScanResponse;

        for (const run of response.runs) {
            // Get the full descriptions of all rules
            let rulesFullDescription: Map<string, string> = new Map<string, string>();
            for (const rule of run.tool.driver.rules) {
                if (rule.fullDescription) {
                    rulesFullDescription.set(rule.id, rule.fullDescription.text);
                }
            }
            // Generate response data
            run.results?.forEach(analyzeIssue => this.generateIssueData(iacResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId)));
        }
        return iacResponse;
    }

    /**
     * Generate the data for a specific analyze issue (the file object, the issue in the file object and all the location objects of this issue).
     * @param iacResponse - the response of the scan that holds all the file objects
     * @param analyzeIssue - the issue to handle and generate information base on it
     * @param fullDescription - the description of the analyzeIssue
     */
    public generateIssueData(iacResponse: IacScanResponse, analyzeIssue: AnalyzeIssue, fullDescription?: string) {
        analyzeIssue.locations.forEach(location => {
            let fileWithIssues: IacFileIssues = this.getOrCreateIacFileIssues(iacResponse, location.physicalLocation.artifactLocation.uri);
            let fileIssue: IacIssue = this.getOrCreateIacIssue(fileWithIssues, analyzeIssue, fullDescription);
            fileIssue.locations.push(location.physicalLocation.region);
        });
    }

    /**
     * Get or create issue in a given file if not exists
     * @param fileWithIssues - the file with the issues
     * @param analyzeIssue - the issue to search or create
     * @param fullDescription - the description of the issue
     * @returns - the Iac issue
     */
    private getOrCreateIacIssue(fileWithIssues: IacFileIssues, analyzeIssue: AnalyzeIssue, fullDescription?: string): IacIssue {
        let potential: IacIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === analyzeIssue.ruleId);
        if (potential) {
            return potential;
        }
        let fileIssue: IacIssue = {
            ruleId: analyzeIssue.ruleId,
            severity: Translators.levelToSeverity(analyzeIssue.level),
            ruleName: analyzeIssue.message.text,
            fullDescription: fullDescription,
            locations: []
        } as IacIssue;
        fileWithIssues.issues.push(fileIssue);
        return fileIssue;
    }

    /**
     * Get or create file with issues if not exists in the response
     * @param response - the response that holds the files
     * @param uri - the files to search or create
     * @returns - file with issues
     */
    private getOrCreateIacFileIssues(response: IacScanResponse, uri: string): IacFileIssues {
        let potential: IacFileIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === uri);
        if (potential) {
            return potential;
        }
        let fileWithIssues: IacFileIssues = {
            full_path: uri,
            issues: []
        } as IacFileIssues;
        response.filesWithIssues.push(fileWithIssues);

        return fileWithIssues;
    }
}
