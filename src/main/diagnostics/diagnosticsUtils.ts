import * as vscode from 'vscode';
import { Severity } from '../types/severity';

export class DiagnosticsUtils {
    public static getDiagnosticSeverity(topSeverity: Severity): vscode.DiagnosticSeverity {
        switch (topSeverity) {
            case Severity.High:
                return vscode.DiagnosticSeverity.Error;
            case Severity.Medium:
                return vscode.DiagnosticSeverity.Warning;
            case Severity.Low:
                return vscode.DiagnosticSeverity.Information;
        }
        return vscode.DiagnosticSeverity.Hint;
    }
}
