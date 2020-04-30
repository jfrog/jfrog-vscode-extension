import { IconsPaths } from '../utils/iconsPaths';
import { Translators } from '../utils/translators';

export enum Severity {
    Normal = 0,
    Pending,
    Unknown,
    Information,
    Low,
    Medium,
    High
}

export enum SeverityStrings {
    Normal = 'Scanned - No Issues',
    Pending = 'Pending Scan',
    Unknown = 'Unknown',
    Information = 'Information',
    Low = 'Low',
    Medium = 'Medium',
    High = 'High'
}

export class SeverityUtils {
    public static getString(severity: Severity) {
        switch (severity) {
            case Severity.Normal:
                return SeverityStrings.Normal;
            case Severity.Pending:
                return SeverityStrings.Pending;
            case Severity.Unknown:
                return SeverityStrings.Unknown;
            case Severity.Information:
                return SeverityStrings.Information;
            case Severity.Low:
                return SeverityStrings.Low;
            case Severity.Medium:
                return SeverityStrings.Medium;
            case Severity.High:
                return SeverityStrings.High;
        }
    }

    public static getIcon(severity: Severity | undefined, hover: boolean = false) {
        switch (severity) {
            case Severity.Pending:
                return IconsPaths.PENDING_SEVERITY;
            case Severity.Unknown:
                return hover ? IconsPaths.UNKNOWN_HOVER_SEVERITY : IconsPaths.UNKNOWN_SEVERITY;
            case Severity.Information:
                return IconsPaths.INFORMATION_SEVERITY;
            case Severity.Low:
                return hover ? IconsPaths.LOW_HOVER_SEVERITY : IconsPaths.LOW_SEVERITY;
            case Severity.Medium:
                return hover ? IconsPaths.MEDIUM_HOVER_SEVERITY : IconsPaths.MEDIUM_SEVERITY;
            case Severity.High:
                return hover ? IconsPaths.HIGH_HOVER_SEVERITY : IconsPaths.HIGH_SEVERITY;
            default:
                return IconsPaths.NORMAL_SEVERITY;
        }
    }

    public static getSeverity(severity: string) {
        switch (Translators.capitalize(severity)) {
            case 'Normal':
                return Severity.Normal;
            case 'Pending':
                return Severity.Pending;
            case 'Unknown':
                return Severity.Unknown;
            case 'Information':
                return Severity.Information;
            case 'Low':
                return Severity.Low;
            case 'Medium':
                return Severity.Medium;
            case 'High':
                return Severity.High;
            default:
                throw new Error(`Unknown severity type in 'getSeverity' function`);
        }
    }
}
