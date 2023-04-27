import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { Severity } from '../../types/severity';
import { Resource } from '../../utils/resource';
import { Translators } from '../../utils/translators';
import { AnalyzeIssue, AnalyzeScanRequest, AnalyzerScanResponse, AnalyzerType, FileRegion } from './analyzerModels';
import { BinaryRunner } from './binaryRunner';

/**
 * The response that is generated from the binary after scanning Secrets
 */
export interface SecretsScanResponse {
    filesWithIssues: SecretsFileIssues[];
}

export interface SecretsFileIssues {
    full_path: string;
    issues: SecretsIssue[];
}

export interface SecretsIssue {
    ruleId: string;
    severity: Severity;
    ruleName: string;
    fullDescription?: string;
    locations: FileRegion[];
}

/**
 * Describes a runner for the Secrets scan executable file.
 */
export class SecretsRunner extends BinaryRunner {
    constructor(connectionManager: ConnectionManager, timeout: number, logManager: LogManager, binary?: Resource) {
        super(connectionManager, timeout, AnalyzerType.Secrets, logManager, binary);
    }

    /** @override */
    public async runBinary(checkCancel: () => void, yamlConfigPath: string, executionLogDirectory: string): Promise<void> {
        await this.executeBinary(checkCancel, ['sec', yamlConfigPath], executionLogDirectory);
    }

    public async scan(directory: string, checkCancel: () => void): Promise<SecretsScanResponse> {
        let request: AnalyzeScanRequest = {
            type: AnalyzerType.Secrets,
            roots: [directory]
        } as AnalyzeScanRequest;
        return await this.run(checkCancel, request).then(runResult => this.generateScanResponse(runResult));
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateScanResponse(response?: AnalyzerScanResponse): SecretsScanResponse {
        if (!response) {
            return {} as SecretsScanResponse;
        }
        let secretsResponse: SecretsScanResponse = {
            filesWithIssues: []
        } as SecretsScanResponse;

        for (const run of response.runs) {
            // Get the full descriptions of all rules
            let rulesFullDescription: Map<string, string> = new Map<string, string>();
            for (const rule of run.tool.driver.rules) {
                if (rule.fullDescription) {
                    rulesFullDescription.set(rule.id, rule.fullDescription.text);
                }
            }
            // Generate response data
            run.results?.forEach(analyzeIssue =>
                this.generateIssueData(secretsResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId))
            );
        }
        return secretsResponse;
    }

    /**
     * Generate the data for a specific analyze issue (the file object, the issue in the file object and all the location objects of this issue).
     * @param secretsResponse - the response of the scan that holds all the file objects
     * @param analyzeIssue - the issue to handle and generate information base on it
     * @param fullDescription - the description of the analyzeIssue
     */
    public generateIssueData(secretsResponse: SecretsScanResponse, analyzeIssue: AnalyzeIssue, fullDescription?: string) {
        analyzeIssue.locations.forEach(location => {
            let fileWithIssues: SecretsFileIssues = this.getOrCreateIacFileIssues(secretsResponse, location.physicalLocation.artifactLocation.uri);
            let fileIssue: SecretsIssue = this.getOrCreateSecretsIssue(fileWithIssues, analyzeIssue, fullDescription);
            fileIssue.locations.push(location.physicalLocation.region);
        });
    }

    /**
     * Get or create issue in a given file if not exists
     * @param fileWithIssues - the file with the issues
     * @param analyzeIssue - the issue to search or create
     * @param fullDescription - the description of the issue
     * @returns - the Secrets issue
     */
    private getOrCreateSecretsIssue(fileWithIssues: SecretsFileIssues, analyzeIssue: AnalyzeIssue, fullDescription?: string): SecretsIssue {
        let potential: SecretsIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === analyzeIssue.ruleId);
        if (potential) {
            return potential;
        }
        let fileIssue: SecretsIssue = {
            ruleId: analyzeIssue.ruleId,
            severity: Translators.levelToSeverity(analyzeIssue.level),
            ruleName: analyzeIssue.message.text,
            fullDescription: fullDescription,
            locations: []
        } as SecretsIssue;
        fileWithIssues.issues.push(fileIssue);
        return fileIssue;
    }

    /**
     * Get or create file with issues if not exists in the response
     * @param response - the response that holds the files
     * @param uri - the files to search or create
     * @returns - file with issues
     */
    private getOrCreateIacFileIssues(response: SecretsScanResponse, uri: string): SecretsFileIssues {
        let potential: SecretsFileIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === uri);
        if (potential) {
            return potential;
        }
        let fileWithIssues: SecretsFileIssues = {
            full_path: uri,
            issues: []
        } as SecretsFileIssues;
        response.filesWithIssues.push(fileWithIssues);

        return fileWithIssues;
    }
}
