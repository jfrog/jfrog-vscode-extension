import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';
import { Configuration } from '../utils/configuration';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERR';

/**
 * Log to the "OUTPUT" channel. Add date and log level.
 */
export class LogManager implements ExtensionComponent {
    private _outputChannel!: vscode.OutputChannel;

    activate(): LogManager {
        this._outputChannel = vscode.window.createOutputChannel('JFrog');
        return this;
    }

    /**
     * Log a message.
     * @param message - The message to log
     * @param level - The log level
     * @param focusOutput - Open the extension output view
     */
    public logMessage(message: string, level: LogLevel, focusOutput: boolean = false): void {
        if (!message) {
            return;
        }
        let selectedLogLevel: LogLevel = Configuration.getLogLevel().toUpperCase() as LogLevel;
        if (this.logLevelToNumber(level) < this.logLevelToNumber(selectedLogLevel)) {
            return;
        }
        const title: string = new Date().toLocaleTimeString();
        this._outputChannel.appendLine(`[${level} - ${title}] ${message}`);
        if (focusOutput) {
            this.showOutput();
        }
    }

    /**
     * Log message and show information message to the user
     * @param message - The message to log
     * @param level - The log level
     * @param focusOutput - Open the extension output view
     */
    public logMessageAndToastInfo(message: string, level: LogLevel, focusOutput: boolean = false): void {
        this.logMessage(message, level, focusOutput);
        vscode.window.showInformationMessage(message);
    }

    /**
     * Log message and error information message to the user
     * @param message - The message to log
     * @param level - The log level
     * @param focusOutput - Open the extension output view
     */
    public logMessageAndToastErr(message: string, level: LogLevel, focusOutput: boolean = true): void {
        this.logMessage(message, level, focusOutput);
        vscode.window.showErrorMessage(message);
    }

    /**
     * Log an error. Show a toast if required.
     * @param error - The error
     * @param shouldToast - True iff toast should be shown
     */
    public logError(error: Error, shouldToast: boolean) {
        let logMessage: string = error.name;
        if (error.message) {
            logMessage += ': ' + error.message;
            if (shouldToast) {
                vscode.window.showErrorMessage(error.message);
                this.showOutput();
            }
        }
        this.logMessage(logMessage, 'ERR');
        if (error.stack) {
            this.logMessage(error.stack, 'DEBUG');
        }
    }

    /**
     * Show JFrog Output tab.
     */
    public showOutput() {
        this._outputChannel.show(true);
    }

    private logLevelToNumber(level: LogLevel): number {
        switch (level) {
            case 'DEBUG':
                return 0;
            case 'INFO':
                return 1;
            case 'WARN':
                return 2;
            case 'ERR':
                return 3;
        }
    }
}
