import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERR';

/**
 * Log to the "OUTPUT" channel. Add date and log level.
 */
export class LogManager implements ExtensionComponent {
    private _outputChannel!: vscode.OutputChannel;

    activate(context: vscode.ExtensionContext): LogManager {
        this._outputChannel = vscode.window.createOutputChannel('JFrog');
        return this;
    }

    /**
     * Log a message.
     * @param message - The message to log
     * @param level - The log level
     */
    public logMessage(message: string, level: LogLevel): void {
        const title: string = new Date().toLocaleTimeString();
        this._outputChannel.appendLine(`[${level} - ${title}] ${message}`);
    }

    /**
     * Log an error. Show a toast if required.
     * @param error - The error
     * @param shouldToast - True iff toast should be shown
     */
    public logError(error: Error, shouldToast: boolean) {
        this.logMessage(error.name, 'ERR');
        if (error.message) {
            this._outputChannel.appendLine(error.message);
            if (shouldToast) {
                vscode.window.showErrorMessage(error.message);
            }
        }
        if (error.stack) {
            this._outputChannel.appendLine(error.stack);
        }
        this._outputChannel.show();
    }
}
