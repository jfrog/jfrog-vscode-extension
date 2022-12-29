import * as path from 'path';
import * as os from 'os';

import { LogManager } from '../../log/logManager';
import { BinaryRunner } from './binaryRunner';
import { ScanUtils } from '../../utils/scanUtils';
import { AnalyzeIssue, AnalyzerScanResponse, AnalyzeScanRequest, FileRegion } from './analyzerModels';

export interface EosScanRequest extends AnalyzeScanRequest {
    language: LanguageType;
}

export type LanguageType = 'python' | 'java' | 'js';

export interface EosScanResponse {
    filesWithIssues: EosFileIssues[];
}

export interface EosFileIssues {
    full_path: string;
    issues: EosFileIssue[];
}

export interface EosFileIssue {
    ruleId: string;
    message: string;
    regions: FileRegion[];
}

export class EosRunner extends BinaryRunner {
    private static readonly RUNNER_FOLDER: string = 'eos';
    private static readonly BINARY_NAME: string = 'main_';

    constructor(abortCheckInterval:number, logManager: LogManager) {
        super(path.join(ScanUtils.getHomePath(), EosRunner.RUNNER_FOLDER, EosRunner.getBinaryName()), abortCheckInterval, logManager);
    }

    protected validateSupported(): boolean {
        if (os.platform() != 'linux' && os.platform() != 'darwin') {
            this._logManager.logMessage("Eos scan is not supported on '" + os.platform() + "' os", 'DEBUG');
            return false;
        }
        return super.validateSupported();
    }

    private static getBinaryName(): string {
        let name: string = EosRunner.BINARY_NAME;
        switch (os.platform()) {
            case 'linux':
                name += 'ubuntu';
                break;
            case 'darwin':
                name += 'macos';
                break;
        }
        return name;
    }

    /** @override */
    public async runBinary(abortSignal: AbortSignal, yamlConfigPath: string): Promise<void> {
        await this.executeBinary(abortSignal, ['analyze', 'config', '"' + yamlConfigPath + '"']);
    }

    public async scan(...requests: EosScanRequest[]): Promise<EosScanResponse | undefined> {
        for (const request of requests) {
            request.type = 'analyze-codebase';
        }
        let response: EosScanResponse | undefined = await this.run(new AbortController(), true, ...requests).then(runResult =>
            this.generateResponse(runResult)
        );
        return response;
    }

    public generateResponse(response?: AnalyzerScanResponse): EosScanResponse | undefined {
        if (!response) {
            return undefined;
        }
        let eosResponse: EosScanResponse = {
            filesWithIssues: []
        } as EosScanResponse;

        for (const run of response.runs) {
            this._logManager.logMessage('<ASSAF> generating response for eos run', 'DEBUG');
            let issues: AnalyzeIssue[] = run.results;
            if (issues) {
                this._logManager.logMessage('<ASSAF> Found issues (len=' + issues.length + ')', 'DEBUG');
                issues.forEach(analyzeIssue => {
                    analyzeIssue.locations.forEach(location => {
                        let fileWithIssues: EosFileIssues = this.getOrCreateEosFileIssues(
                            eosResponse,
                            location.physicalLocation.artifactLocation.uri
                        );
                        let fileIssue: EosFileIssue = this.getOrCreateEosFileIssue(fileWithIssues, analyzeIssue);
                        fileIssue.regions.push(location.physicalLocation.region);
                    });
                });
            }
        }
        return eosResponse;
    }

    getOrCreateEosFileIssue(fileWithIssues: EosFileIssues, analyzeIssue: AnalyzeIssue): EosFileIssue {
        let potential: EosFileIssue | undefined = fileWithIssues.issues.find(
            issue => issue.ruleId === analyzeIssue.ruleId && issue.message === analyzeIssue.message.text
        );
        if (potential) {
            return potential;
        }
        let fileIssue: EosFileIssue = {
            ruleId: analyzeIssue.ruleId,
            message: analyzeIssue.message.text,
            regions: []
        } as EosFileIssue;
        fileWithIssues.issues.push(fileIssue);
        return fileIssue;
    }

    getOrCreateEosFileIssues(response: EosScanResponse, uri: string): EosFileIssues {
        let potential: EosFileIssues | undefined = response.filesWithIssues.find(fileWithIssues => fileWithIssues.full_path === uri);
        if (potential) {
            return potential;
        }
        let fileWithIssues: EosFileIssues = {
            full_path: uri,
            issues: []
        } as EosFileIssues;
        response.filesWithIssues.push(fileWithIssues);

        return fileWithIssues;
    }
}
