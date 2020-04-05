import * as vscode from 'vscode';
import { ExtensionComponent } from '../extensionComponent';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERR';

/**
 * Log to the "OUTPUT" channel. Add date and log level.
 */
export class LogManager implements ExtensionComponent {
    private _statusBar!: vscode.StatusBarItem;
    private _outputChannel!: vscode.OutputChannel;

    constructor() {
        this._statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this._statusBar.tooltip = 'JFrog Xray vulnerabilities scanning status';
        this._statusBar.command = 'jfrog.xray.showOutput';
    }

    activate(context: vscode.ExtensionContext): LogManager {
        this._outputChannel = vscode.window.createOutputChannel('JFrog');
        this._statusBar.show();
        return this;
    }

    /**
     * Log a message.
     * @param message - The message to log
     * @param level - The log level
     */
    public logMessage(message: string, level: LogLevel): void {
        if (!!message) {
            const title: string = new Date().toLocaleTimeString();
            this._outputChannel.appendLine(`[${level} - ${title}] ${message}`);
        }
    }

    /**
     * Log an error. Show a toast if required.
     * @param error - The error
     * @param shouldToast - True iff toast should be shown
     */
    public logError(error: Error, shouldToast: boolean) {
        this.setFailed();
        this.logMessage(error.name, 'ERR');
        if (error.message) {
            this._outputChannel.appendLine(error.message);
            if (shouldToast) {
                vscode.window.showErrorMessage(error.message);
                this.showOutput();
            }
        }
        if (error.stack) {
            this._outputChannel.appendLine(error.stack);
        }
    }

    /**
     * Show JFrog Output tab.
     */
    public showOutput() {
        this._outputChannel.show(true);
    }

    /**
     * Set success in the JFrog status bar.
     */
    public setSuccess() {
        this._statusBar.text = 'JFrog: $(check)';
    }

    /**
     * Set failure in the JFrog status bar.
     */
    private setFailed() {
        this._statusBar.text = 'JFrog: $(error)';
    }
}
