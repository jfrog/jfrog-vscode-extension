import * as path from 'path';
import { ScanUtils } from './scanUtils';

export class IconsPaths {
    // Icons severities
    static readonly NORMAL_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'Normal'));
    static readonly PENDING_SEVERITY: string = IconsPaths.getSeverityIcon('Unknown');
    static readonly UNKNOWN_SEVERITY: string = IconsPaths.getSeverityIcon('Unknown');
    static readonly NOT_APPLICABLE_UNKNOWN_SEVERITY: string = IconsPaths.getSeverityIcon('notApplicableUnknown');
    static readonly NOT_APPLICABLE_LOW_SEVERITY: string = IconsPaths.getSeverityIcon('notApplicableLow');
    static readonly NOT_APPLICABLE_MEDIUM_SEVERITY: string = IconsPaths.getSeverityIcon('notApplicableMedium');
    static readonly NOT_APPLICABLE_HIGH_SEVERITY: string = IconsPaths.getSeverityIcon('notApplicableHigh');
    static readonly NOT_APPLICABLE_CRITICAL_SEVERITY: string = IconsPaths.getSeverityIcon('notApplicableCritical');
    static readonly INFORMATION_SEVERITY: string = IconsPaths.getSeverityIcon('Low');
    static readonly LOW_SEVERITY: string = IconsPaths.getSeverityIcon('Low');
    static readonly MEDIUM_SEVERITY: string = IconsPaths.getSeverityIcon('Medium');
    static readonly HIGH_SEVERITY: string = IconsPaths.getSeverityIcon('High');
    static readonly CRITICAL_SEVERITY: string = IconsPaths.getSeverityIcon('Critical');

    // Hover severities
    static readonly UNKNOWN_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'unknownHover'));
    static readonly LOW_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'lowHover'));
    static readonly MEDIUM_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'mediumHover'));
    static readonly HIGH_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'highHover'));
    static readonly CRITICAL_HOVER_SEVERITY: string = IconsPaths.getIconPath(path.join('severities', 'hover', 'criticalHover'));

    // Icons builds status
    static readonly BUILD_SUCCESS: string = IconsPaths.getIconPath(path.join('severities', 'Normal'));
    static readonly BUILD_FAILED: string = IconsPaths.getSeverityIcon('Critical');
    static readonly BUILD_UNKNOWN: string = IconsPaths.getSeverityIcon('Unknown');

    // License
    static readonly VIOLATED_LICENSE: string = IconsPaths.getIconPath('violatedLicense');

    public static getIconPath(iconName: string) {
        return path.join(ScanUtils.RESOURCES_DIR, iconName + '.png');
    }

    public static getSeverityIcon(iconName: string) {
        return path.join(ScanUtils.RESOURCES_DIR, 'severities', iconName + '.svg');
    }
}
