import * as path from 'path';
import * as os from 'os';

import { ConnectionManager } from '../../connect/connectionManager';
import { LogManager } from '../../log/logManager';
import { ScanUtils } from '../../utils/scanUtils';
import { AnalyzeIssue, AnalyzerScanResponse, AnalyzeScanRequest, FileRegion } from './analyzerModels';
import { BinaryRunner } from './binaryRunner';
import { Severity } from '../../types/severity';
import { Translators } from '../../utils/translators';

export interface TerraformScanResponse {
    filesWithIssues: TerraformFileIssues[];
}

export interface TerraformFileIssues {
    full_path: string;
    issues: TerraformIssue[];
}

export interface TerraformIssue {
    ruleId: string;
    severity: Severity;
    ruleName: string;
    fullDescription?: string;
    locations: FileRegion[];
}

export class TerraformRunner extends BinaryRunner {
    private static readonly BINARY_FOLDER: string = 'terraform';
    private static readonly BINARY_NAME: string = 'tf_scanner';

    constructor(connectionManager: ConnectionManager, abortCheckInterval: number, logManager: LogManager) {
        super(
            connectionManager,
            abortCheckInterval,
            logManager,
            path.join(ScanUtils.getHomePath(), TerraformRunner.BINARY_FOLDER, TerraformRunner.getBinaryName())
        );
    }

    protected validateSupported(): boolean {
        if (os.platform() !== 'linux' && os.platform() !== 'darwin' && os.platform() !== 'win32') {
            this._logManager.logMessage("Eos scan is not supported on '" + os.platform() + "' os", 'DEBUG');
            return false;
        }
        return super.validateSupported();
    }

    /** @override */
    protected static getBinaryName(): string {
        let name: string = TerraformRunner.BINARY_NAME;
        switch (os.platform()) {
            case 'linux':
                return name + '_ubuntu';
            case 'darwin':
                return name + '_macos';
            case 'win32':
                return name + '.exe';
        }
        return name;
    }

    /** @override */
    public async runBinary(abortSignal: AbortSignal, yamlConfigPath: string): Promise<void> {
        await this.executeBinary(abortSignal, ['scan', yamlConfigPath]);
    }

    /**
     * Scan for Terraform issues
     * @param abortController - the controller that signals abort for the operation
     * @param requests - requests to run
     * @returns the response generated from the scan
     */
    public async scan(abortController: AbortController, directory: string): Promise<TerraformScanResponse> {
        let request: AnalyzeScanRequest = {
            type: 'iac-scan-modules',
            roots: [directory]
        } as AnalyzeScanRequest;
        this._logManager.logMessage(JSON.stringify(request),'DEBUG');
        return await this.run(abortController, true, request).then(runResult => this.generateScanResponse(runResult));
    }

    /**
     * Generate response from the run results
     * @param run - the run results generated from the binary
     * @returns the response generated from the scan run
     */
    public generateScanResponse(response?: AnalyzerScanResponse): TerraformScanResponse {
        if (!response) {
            return {} as TerraformScanResponse;
        }
        this._logManager.logMessage(JSON.stringify(response),'DEBUG');
        let iacResponse: TerraformScanResponse = {
            filesWithIssues: []
        } as TerraformScanResponse;

        for (const run of response.runs) {
            // Prepare
            let rulesFullDescription: Map<string, string> = new Map<string, string>();
            for (const rule of run.tool.driver.rules) {
                rulesFullDescription.set(rule.id, rule.fullDescription.text);
            }
            // Generate response data
            run.results?.forEach(analyzeIssue => this.generateIssueData(iacResponse, analyzeIssue, rulesFullDescription.get(analyzeIssue.ruleId)));
        }
        return iacResponse;
    }

    /**
     * Generate the data for a specific analyze issue (the file object, the issue in the file object and all the location objects of this issue).
     * If the issue also contains codeFlow generate the needed information for it as well
     * @param iacResponse - the response of the scan that holds all the file objects
     * @param analyzeIssue - the issue to handle and generate information base on it
     * @param fullDescription - the description of the analyzeIssue
     */
    public generateIssueData(iacResponse: TerraformScanResponse, analyzeIssue: AnalyzeIssue, fullDescription?: string) {
        analyzeIssue.locations.forEach(location => {
            let fileWithIssues: TerraformFileIssues = this.getOrCreateEosFileIssues(iacResponse, location.physicalLocation.artifactLocation.uri);
            let fileIssue: TerraformIssue = this.getOrCreateEosIssue(fileWithIssues, analyzeIssue, fullDescription);
            fileIssue.locations.push(location.physicalLocation.region);
        });
    }

    /**
     * Get or create issue in a given file if not exists
     * @param fileWithIssues - the file with the issues
     * @param analyzeIssue - the issue to search or create
     * @param fullDescription - the description of the issue
     * @returns - the eos issue
     */
    private getOrCreateEosIssue(fileWithIssues: TerraformFileIssues, analyzeIssue: AnalyzeIssue, fullDescription?: string): TerraformIssue {
        let potential: TerraformIssue | undefined = fileWithIssues.issues.find(issue => issue.ruleId === analyzeIssue.ruleId);
        if (potential) {
            return potential;
        }
        let fileIssue: TerraformIssue = {
            ruleId: analyzeIssue.ruleId,
            severity: Translators.levelToSeverity(analyzeIssue.level),
            ruleName: analyzeIssue.message.text,
            fullDescription: fullDescription,
            locations: []
        } as TerraformIssue;
        fileWithIssues.issues.push(fileIssue);
        return fileIssue;
    }

    /**
     * Get or create file with issues if not exists in the response
     * @param response - the response that holds the files
     * @param uri - the files to search or create
     * @returns - file with issues
     */
    private getOrCreateEosFileIssues(response: TerraformScanResponse, uri: string): TerraformFileIssues {
        let potential: TerraformFileIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === uri);
        if (potential) {
            return potential;
        }
        let fileWithIssues: TerraformFileIssues = {
            full_path: uri,
            issues: []
        } as TerraformFileIssues;
        response.filesWithIssues.push(fileWithIssues);

        return fileWithIssues;
    }
}
