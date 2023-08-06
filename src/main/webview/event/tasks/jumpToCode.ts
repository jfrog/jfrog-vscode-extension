import { IAnalysisStep } from 'jfrog-ide-webview';
import * as vscode from 'vscode';
import { ScanUtils } from '../../../utils/scanUtils';
import { LogManager } from '../../../log/logManager';

/**
 * Represents a task that performs a jump to code operation.
 */
export class JumpToCodeTask {
    /**
     * Creates an instance of the JumpToCodeTask.
     * @param data - The analysis step data containing code information.
     * @param logManager - The log manager for logging messages.
     */
    constructor(private data: IAnalysisStep, private logManager: LogManager) {}

    /**
     * Executes the jump to code operation.
     */
    public run() {
        this.logManager.logMessage(`Open file '${this.data.file}'`, 'DEBUG');
        ScanUtils.openFile(
            this.data.file,
            new vscode.Range(this.data.startRow - 1, this.data.startColumn - 1, this.data.endRow - 1, this.data.endColumn - 1)
        );
    }
}
