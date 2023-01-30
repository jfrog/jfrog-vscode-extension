import { IconsPaths } from '../utils/iconsPaths';
import { Translators } from '../utils/translators';
import { ISeverity } from 'jfrog-ide-webview';

export enum Severity {
    Normal = 0,
    Pending,
    NotApplicableUnknown,
    NotApplicableLow,
    NotApplicableMedium,
    NotApplicableHigh,
    NotApplicableCritical,
    Unknown,
    Information,
    Low,
    Medium,
    High,
    Critical
}

export enum SeverityStrings {
    Normal = 'Scanned - No Issues',
    Pending = 'Pending Scan',
    NotApplicableUnknown = 'Unknown (Not Applicable)',
    NotApplicableLow = 'Low (Not Applicable)',
    NotApplicableMedium = 'Medium (Not Applicable)',
    NotApplicableHigh = 'High (Not Applicable)',
    NotApplicableCritical = 'Critical (Not Applicable)',
    Unknown = 'Unknown',
    Information = 'Information',
    Low = 'Low',
    Medium = 'Medium',
    High = 'High',
    Critical = 'Critical'
}

export class SeverityUtils {
    public static notApplicable(severity: Severity): Severity {
        switch (severity) {
            case Severity.Unknown:
            case Severity.NotApplicableUnknown:
                return Severity.NotApplicableUnknown;
            case Severity.Low:
            case Severity.NotApplicableLow:
                return Severity.NotApplicableLow;
            case Severity.Medium:
            case Severity.NotApplicableMedium:
                return Severity.NotApplicableMedium;
            case Severity.High:
            case Severity.NotApplicableHigh:
                return Severity.NotApplicableHigh;
            case Severity.Critical:
            case Severity.NotApplicableCritical:
                return Severity.NotApplicableCritical;
        }
        return severity;
    }

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
            case Severity.Critical:
                return SeverityStrings.Critical;
            case Severity.NotApplicableUnknown:
                return SeverityStrings.NotApplicableUnknown;
            case Severity.NotApplicableLow:
                return SeverityStrings.NotApplicableLow;
            case Severity.NotApplicableMedium:
                return SeverityStrings.NotApplicableMedium;
            case Severity.NotApplicableHigh:
                return SeverityStrings.NotApplicableHigh;
            case Severity.NotApplicableCritical:
                return SeverityStrings.NotApplicableCritical;
        }
    }

    public static toWebviewSeverity(severity: Severity): ISeverity {
        switch (severity) {
            case Severity.Low:
            case Severity.NotApplicableLow:
                return ISeverity.Low;
            case Severity.Medium:
            case Severity.NotApplicableMedium:
                return ISeverity.Medium;
            case Severity.High:
            case Severity.NotApplicableHigh:
                return ISeverity.High;
            case Severity.Critical:
            case Severity.NotApplicableCritical:
                return ISeverity.Critical;
        }
        return ISeverity.Unknown;
    }

    public static getIcon(severity: Severity | undefined, hover: boolean = false) {
        switch (severity) {
            case Severity.Pending:
                return IconsPaths.PENDING_SEVERITY;
            case Severity.NotApplicableUnknown:
                return hover ? IconsPaths.UNKNOWN_HOVER_SEVERITY : IconsPaths.NOT_APPLICABLE_UNKNOWN_SEVERITY;
            case Severity.NotApplicableLow:
                return hover ? IconsPaths.LOW_HOVER_SEVERITY : IconsPaths.NOT_APPLICABLE_LOW_SEVERITY;
            case Severity.NotApplicableMedium:
                return hover ? IconsPaths.MEDIUM_HOVER_SEVERITY : IconsPaths.NOT_APPLICABLE_MEDIUM_SEVERITY;
            case Severity.NotApplicableHigh:
                return hover ? IconsPaths.HIGH_HOVER_SEVERITY : IconsPaths.NOT_APPLICABLE_HIGH_SEVERITY;
            case Severity.NotApplicableCritical:
                return hover ? IconsPaths.CRITICAL_HOVER_SEVERITY : IconsPaths.NOT_APPLICABLE_CRITICAL_SEVERITY;
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
            case Severity.Critical:
                return hover ? IconsPaths.CRITICAL_HOVER_SEVERITY : IconsPaths.CRITICAL_SEVERITY;
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
            case 'Critical':
                return Severity.Critical;
            default:
                throw new Error(`Unknown severity type in 'getSeverity' function`);
        }
    }
}
